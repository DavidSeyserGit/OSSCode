import { ServiceMap } from "effect";
import type { Effect, Scope } from "effect";

export interface QueuedTurnReactorShape {
  readonly start: Effect.Effect<void, never, Scope.Scope>;
}

export class QueuedTurnReactor extends ServiceMap.Service<
  QueuedTurnReactor,
  QueuedTurnReactorShape
>()("osscode/orchestration/Services/QueuedTurnReactor") {}
