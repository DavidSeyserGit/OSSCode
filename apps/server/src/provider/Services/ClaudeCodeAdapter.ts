/**
 * ClaudeCodeAdapter - Claude Code implementation of the generic provider adapter contract.
 *
 * This service owns Claude Code CLI process / stream-json semantics and emits
 * canonical provider runtime events for the rest of the app.
 *
 * @module ClaudeCodeAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface ClaudeCodeAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "claudeCode";
}

export class ClaudeCodeAdapter extends ServiceMap.Service<
  ClaudeCodeAdapter,
  ClaudeCodeAdapterShape
>()("osscode/provider/Services/ClaudeCodeAdapter") {}
