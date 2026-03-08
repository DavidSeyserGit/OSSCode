import assert from "node:assert/strict";

import { it } from "@effect/vitest";
import { Effect, Layer, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { ProviderModels } from "../Services/ProviderModels.ts";
import { parseCursorModelsOutput, ProviderModelsLive } from "./ProviderModels.ts";

const encoder = new TextEncoder();

function mockHandle(result: { stdout: string; stderr: string; code: number }) {
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(result.code)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    stdin: Sink.drain,
    stdout: Stream.make(encoder.encode(result.stdout)),
    stderr: Stream.make(encoder.encode(result.stderr)),
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

function mockSpawnerLayer(
  handler: (args: ReadonlyArray<string>) => { stdout: string; stderr: string; code: number },
) {
  return Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) => {
      const cmd = command as unknown as { args: ReadonlyArray<string> };
      return Effect.succeed(mockHandle(handler(cmd.args)));
    }),
  );
}

it("parses Cursor CLI model output and preserves Auto", () => {
  assert.deepEqual(
    parseCursorModelsOutput(
      "\u001b[2K\u001b[GLoading models…\nAvailable models\n\nauto - Auto\ngpt-5 - GPT-5\nopus-4.6-thinking - Claude 4.6 Opus (Thinking)  (current, default)\nTip: use --model <id> to switch.\n",
    ),
    [
      { slug: "auto", name: "Auto" },
      { slug: "gpt-5", name: "GPT-5" },
      { slug: "opus-4.6-thinking", name: "Claude 4.6 Opus (Thinking)" },
    ],
  );
});

it.effect("fetches Cursor models once and serves cached values", () => {
  let spawnCount = 0;
  const layer = ProviderModelsLive.pipe(
    Layer.provide(
      mockSpawnerLayer((args) => {
        spawnCount += 1;
        assert.deepEqual(args, ["models"]);
        return {
          stdout: "gpt-5 - GPT-5\nsonnet-4 - Claude Sonnet 4\n",
          stderr: "",
          code: 0,
        };
      }),
    ),
  );

  return Effect.gen(function* () {
    const models = yield* ProviderModels;

    const first = yield* models.getModels("cursor");
    const second = yield* models.getModels("cursor");

    assert.equal(spawnCount, 1);
    assert.deepEqual(first, [
      { slug: "auto", name: "Auto" },
      { slug: "gpt-5", name: "GPT-5" },
      { slug: "sonnet-4", name: "Claude Sonnet 4" },
    ]);
    assert.deepEqual(second, first);
  }).pipe(Effect.provide(layer));
});

it.effect("falls back to Auto when Cursor model discovery fails", () => {
  const layer = ProviderModelsLive.pipe(
    Layer.provide(
      mockSpawnerLayer(() => ({
        stdout: "",
        stderr: "command failed",
        code: 1,
      })),
    ),
  );

  return Effect.gen(function* () {
    const models = yield* ProviderModels;
    assert.deepEqual(yield* models.getModels("cursor"), [{ slug: "auto", name: "Auto" }]);
  }).pipe(Effect.provide(layer));
});
