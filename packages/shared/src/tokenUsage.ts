import type { OrchestrationTokenUsage } from "@t3tools/contracts";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asNonNegativeInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return null;
  }
  return Math.round(value);
}

function pickNumber(
  record: Record<string, unknown>,
  keys: ReadonlyArray<string>,
  nestedKeys: ReadonlyArray<ReadonlyArray<string>> = [],
): number | null {
  for (const key of keys) {
    const value = asNonNegativeInt(record[key]);
    if (value !== null) {
      return value;
    }
  }

  for (const path of nestedKeys) {
    let current: unknown = record;
    for (const segment of path) {
      current = asRecord(current)?.[segment];
      if (current === undefined) {
        break;
      }
    }
    const value = asNonNegativeInt(current);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

export function normalizeTokenUsage(
  rawUsage: unknown,
  updatedAt: string,
): OrchestrationTokenUsage | null {
  const usageRecord = asRecord(asRecord(rawUsage)?.usage) ?? asRecord(rawUsage);
  if (!usageRecord) {
    return null;
  }

  const inputTokens = pickNumber(usageRecord, [
    "inputTokens",
    "input_tokens",
    "promptTokens",
    "prompt_tokens",
  ]);
  const outputTokens = pickNumber(usageRecord, [
    "outputTokens",
    "output_tokens",
    "completionTokens",
    "completion_tokens",
  ]);
  const cachedInputTokens = pickNumber(
    usageRecord,
    [
      "cachedInputTokens",
      "cached_input_tokens",
      "cacheReadInputTokens",
      "cache_read_input_tokens",
    ],
    [
      ["input_tokens_details", "cached_tokens"],
      ["prompt_tokens_details", "cached_tokens"],
    ],
  );
  const reasoningTokens = pickNumber(
    usageRecord,
    ["reasoningTokens", "reasoning_tokens"],
    [
      ["output_tokens_details", "reasoning_tokens"],
      ["completion_tokens_details", "reasoning_tokens"],
    ],
  );
  const totalTokens = pickNumber(usageRecord, ["totalTokens", "total_tokens"]);

  if (
    inputTokens === null &&
    outputTokens === null &&
    cachedInputTokens === null &&
    reasoningTokens === null &&
    totalTokens === null
  ) {
    return null;
  }

  return {
    inputTokens: inputTokens ?? 0,
    outputTokens: outputTokens ?? 0,
    cachedInputTokens: cachedInputTokens ?? 0,
    reasoningTokens: reasoningTokens ?? 0,
    totalTokens: totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0),
    updatedAt,
  };
}

export function sumTokenUsage(
  usages: ReadonlyArray<OrchestrationTokenUsage | null | undefined>,
): OrchestrationTokenUsage | null {
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedInputTokens = 0;
  let reasoningTokens = 0;
  let totalTokens = 0;
  let updatedAt: string | null = null;

  for (const usage of usages) {
    if (!usage) {
      continue;
    }
    inputTokens += usage.inputTokens;
    outputTokens += usage.outputTokens;
    cachedInputTokens += usage.cachedInputTokens;
    reasoningTokens += usage.reasoningTokens;
    totalTokens += usage.totalTokens;
    if (updatedAt === null || usage.updatedAt > updatedAt) {
      updatedAt = usage.updatedAt;
    }
  }

  if (updatedAt === null) {
    return null;
  }

  return {
    inputTokens,
    outputTokens,
    cachedInputTokens,
    reasoningTokens,
    totalTokens,
    updatedAt,
  };
}
