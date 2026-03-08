import type { ProviderAvailableModel, ProviderKind } from "@t3tools/contracts";
import { getModelOptions } from "@t3tools/shared/model";
import { Effect, Layer, Option, Ref, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ProviderModels, type ProviderModelsShape } from "../Services/ProviderModels.ts";

const CURSOR_MODELS_CACHE_TTL_MS = 60_000;
const CURSOR_MODELS_TIMEOUT_MS = 4_000;
const ANSI_ESCAPE_PATTERN = new RegExp(
  String.raw`\u001b(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))`,
  "g",
);
const DEFAULT_CURSOR_MODELS = [{ slug: "auto", name: "Auto" }] as const satisfies ReadonlyArray<ProviderAvailableModel>;

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number;
}

interface CachedProviderModels {
  readonly fetchedAtMs: number;
  readonly models: ReadonlyArray<ProviderAvailableModel>;
}

function stripAnsi(value: string): string {
  return value.replaceAll(ANSI_ESCAPE_PATTERN, "");
}

function collectStreamAsString<E>(stream: Stream.Stream<Uint8Array, E>): Effect.Effect<string, E> {
  return Stream.runFold(
    stream,
    () => "",
    (acc, chunk) => acc + new TextDecoder().decode(chunk),
  );
}

function buildStaticProviderModels(provider: Exclude<ProviderKind, "cursor">) {
  return getModelOptions(provider).map((option) => ({
    slug: option.slug,
    name: option.name,
  })) satisfies ReadonlyArray<ProviderAvailableModel>;
}

function stripCursorStatusSuffix(value: string): string {
  return value.replace(/\s+\((?:current|default)(?:,\s*(?:current|default))*\)\s*$/i, "").trim();
}

function parseCursorModelLine(value: string): ProviderAvailableModel | null {
  const withoutBullet = value.replace(/^(?:[-*•]\s+|\d+\.\s+)/, "").trim();
  if (!withoutBullet) {
    return null;
  }

  const normalizedLine = stripCursorStatusSuffix(withoutBullet);
  if (!normalizedLine) {
    return null;
  }

  const lineMatch = normalizedLine.match(/^(?<slug>[^-][^-]*?|.+?)\s+-\s+(?<name>.+)$/);
  if (lineMatch?.groups) {
    const slug = lineMatch.groups.slug?.trim();
    const name = lineMatch.groups.name?.trim();
    if (slug && name) {
      return {
        slug: /^auto$/i.test(slug) ? "auto" : slug,
        name: /^auto$/i.test(slug) ? "Auto" : name,
      };
    }
  }

  if (/^auto$/i.test(normalizedLine)) {
    return { slug: "auto", name: "Auto" };
  }

  return {
    slug: normalizedLine,
    name: normalizedLine,
  };
}

function mergeModels(
  base: ReadonlyArray<ProviderAvailableModel>,
  extra: ReadonlyArray<ProviderAvailableModel>,
): ReadonlyArray<ProviderAvailableModel> {
  const merged: ProviderAvailableModel[] = [];
  const seen = new Set<string>();

  for (const model of [...base, ...extra]) {
    const key = model.slug.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(model);
  }

  return merged;
}

export function parseCursorModelsOutput(output: string): ReadonlyArray<ProviderAvailableModel> {
  const lines = stripAnsi(output)
    .replaceAll("\r", "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsedModels: ProviderAvailableModel[] = [];
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (
      lower === "loading models..." ||
      lower === "loading models…" ||
      lower === "available models:" ||
      lower === "available models" ||
      lower === "models:" ||
      lower.startsWith("tip:")
    ) {
      continue;
    }
    if (lower === "no models available for this account.") {
      return DEFAULT_CURSOR_MODELS;
    }
    if (/^[-=]{3,}$/.test(line)) {
      continue;
    }

    const model = parseCursorModelLine(line);
    if (model) {
      parsedModels.push(model);
    }
  }

  return mergeModels(DEFAULT_CURSOR_MODELS, parsedModels);
}

export const ProviderModelsLive = Layer.effect(
  ProviderModels,
  Effect.gen(function* () {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const cacheRef = yield* Ref.make(new Map<ProviderKind, CachedProviderModels>());
    const runCursorModelsCommand = Effect.gen(function* () {
      const command = ChildProcess.make("cursor-agent", ["models"], {
        shell: process.platform === "win32",
      });
      const child = yield* spawner.spawn(command);
      const [stdout, stderr, exitCode] = yield* Effect.all(
        [
          collectStreamAsString(child.stdout),
          collectStreamAsString(child.stderr),
          child.exitCode.pipe(Effect.map(Number)),
        ],
        { concurrency: "unbounded" },
      );

      return { stdout, stderr, code: exitCode } satisfies CommandResult;
    }).pipe(Effect.scoped);

    const readCursorModels = Effect.gen(function* () {
      const now = Date.now();
      const cached = (yield* Ref.get(cacheRef)).get("cursor");
      if (cached && now - cached.fetchedAtMs < CURSOR_MODELS_CACHE_TTL_MS) {
        return cached.models;
      }

      const commandResult = yield* runCursorModelsCommand.pipe(
        Effect.timeoutOption(CURSOR_MODELS_TIMEOUT_MS),
        Effect.catchCause((cause) =>
          Effect.logWarning("failed to fetch Cursor models", { cause }).pipe(
            Effect.as(Option.none<CommandResult>()),
          ),
        ),
      );
      const models =
        commandResult._tag === "Some" && commandResult.value.code === 0
          ? parseCursorModelsOutput(commandResult.value.stdout || commandResult.value.stderr)
          : DEFAULT_CURSOR_MODELS;

      yield* Ref.update(cacheRef, (current) => {
        const next = new Map(current);
        next.set("cursor", { fetchedAtMs: now, models });
        return next;
      });

      return models;
    });

    const getModels: ProviderModelsShape["getModels"] = (provider) => {
      switch (provider) {
        case "cursor":
          return readCursorModels;
        case "codex":
          return Effect.succeed(buildStaticProviderModels("codex"));
        case "claudeCode":
          return Effect.succeed(buildStaticProviderModels("claudeCode"));
      }
    };

    return {
      getModels,
    } satisfies ProviderModelsShape;
  }),
);
