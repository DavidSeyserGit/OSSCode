import { describe, expect, it } from "vitest";

import { normalizeTokenUsage, sumTokenUsage } from "./tokenUsage";

describe("normalizeTokenUsage", () => {
  it("normalizes openai-style usage fields", () => {
    expect(
      normalizeTokenUsage(
        {
          input_tokens: 1200,
          output_tokens: 300,
          total_tokens: 1500,
          input_tokens_details: {
            cached_tokens: 200,
          },
          output_tokens_details: {
            reasoning_tokens: 80,
          },
        },
        "2026-03-08T00:00:00.000Z",
      ),
    ).toEqual({
      inputTokens: 1200,
      outputTokens: 300,
      cachedInputTokens: 200,
      reasoningTokens: 80,
      totalTokens: 1500,
      updatedAt: "2026-03-08T00:00:00.000Z",
    });
  });

  it("normalizes camelCase usage fields nested under usage", () => {
    expect(
      normalizeTokenUsage(
        {
          usage: {
            inputTokens: 900,
            outputTokens: 100,
            cacheReadInputTokens: 50,
          },
        },
        "2026-03-08T00:00:00.000Z",
      ),
    ).toEqual({
      inputTokens: 900,
      outputTokens: 100,
      cachedInputTokens: 50,
      reasoningTokens: 0,
      totalTokens: 1000,
      updatedAt: "2026-03-08T00:00:00.000Z",
    });
  });

  it("returns null when no token counts are present", () => {
    expect(normalizeTokenUsage({ foo: "bar" }, "2026-03-08T00:00:00.000Z")).toBeNull();
  });
});

describe("sumTokenUsage", () => {
  it("sums tracked token usage totals", () => {
    expect(
      sumTokenUsage([
        {
          inputTokens: 100,
          outputTokens: 40,
          cachedInputTokens: 10,
          reasoningTokens: 5,
          totalTokens: 140,
          updatedAt: "2026-03-08T00:00:00.000Z",
        },
        null,
        {
          inputTokens: 30,
          outputTokens: 10,
          cachedInputTokens: 0,
          reasoningTokens: 2,
          totalTokens: 40,
          updatedAt: "2026-03-08T00:01:00.000Z",
        },
      ]),
    ).toEqual({
      inputTokens: 130,
      outputTokens: 50,
      cachedInputTokens: 10,
      reasoningTokens: 7,
      totalTokens: 180,
      updatedAt: "2026-03-08T00:01:00.000Z",
    });
  });
});
