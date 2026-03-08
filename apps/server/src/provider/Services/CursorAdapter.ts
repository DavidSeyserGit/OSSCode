/**
 * CursorAdapter - Cursor implementation of the generic provider adapter contract.
 *
 * This service owns Cursor Agent CLI process / stream-json semantics and emits
 * canonical provider runtime events for the rest of the app.
 *
 * @module CursorAdapter
 */
import { ServiceMap } from "effect";

import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

export interface CursorAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {
  readonly provider: "cursor";
}

export class CursorAdapter extends ServiceMap.Service<
  CursorAdapter,
  CursorAdapterShape
>()("osscode/provider/Services/CursorAdapter") {}
