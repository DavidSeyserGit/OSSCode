import { CommandId, type OrchestrationEvent } from "@t3tools/contracts";
import { Cache, Duration, Effect, Layer, Option, Stream } from "effect";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { canConsumeQueuedThreadTurn } from "../queuedTurns.ts";
import {
  QueuedTurnReactor,
  type QueuedTurnReactorShape,
} from "../Services/QueuedTurnReactor.ts";

type QueueRelevantEvent = Extract<
  OrchestrationEvent,
  {
    type:
      | "thread.turn-enqueued"
      | "thread.turn-diff-completed"
      | "thread.session-set"
      | "thread.activity-appended";
  }
>;

const DISPATCHED_QUEUE_ENTRY_KEY_MAX = 10_000;
const DISPATCHED_QUEUE_ENTRY_KEY_TTL = Duration.minutes(30);

const serverCommandId = (tag: string): CommandId =>
  CommandId.makeUnsafe(`server:${tag}:${crypto.randomUUID()}`);

const makeQueuedTurnReactor = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const dispatchedQueueEntryKeys = yield* Cache.make<string, true>({
    capacity: DISPATCHED_QUEUE_ENTRY_KEY_MAX,
    timeToLive: DISPATCHED_QUEUE_ENTRY_KEY_TTL,
    lookup: () => Effect.succeed(true),
  });

  const hasDispatchedQueueEntryRecently = (key: string) =>
    Cache.getOption(dispatchedQueueEntryKeys, key).pipe(
      Effect.flatMap((cached) =>
        Cache.set(dispatchedQueueEntryKeys, key, true).pipe(Effect.as(Option.isSome(cached))),
      ),
    );

  const maybeConsumeNextQueuedTurn = (threadId: string) =>
    Effect.gen(function* () {
      const readModel = yield* orchestrationEngine.getReadModel();
      const thread = readModel.threads.find((entry) => entry.id === threadId);
      if (!thread || !canConsumeQueuedThreadTurn(thread)) {
        return;
      }

      const nextQueuedTurn = thread.queuedTurns[0];
      if (!nextQueuedTurn) {
        return;
      }

      const queueKey = `${thread.id}:${nextQueuedTurn.queueEntryId}`;
      const alreadyDispatched = yield* hasDispatchedQueueEntryRecently(queueKey);
      if (alreadyDispatched) {
        return;
      }

      yield* orchestrationEngine
        .dispatch({
          type: "thread.turn.queue.consume",
          commandId: serverCommandId("queued-turn-consume"),
          threadId: thread.id,
          queueEntryId: nextQueuedTurn.queueEntryId,
          createdAt: new Date().toISOString(),
        })
        .pipe(Effect.catch(() => Effect.void));
    });

  const processDomainEventSafely = (event: QueueRelevantEvent) =>
    maybeConsumeNextQueuedTurn(event.payload.threadId).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("queued turn reactor failed to evaluate thread queue").pipe(
          Effect.annotateLogs({
            threadId: event.payload.threadId,
            eventType: event.type,
            cause,
          }),
        ),
      ),
    );

  const start: QueuedTurnReactorShape["start"] = Effect.gen(function* () {
    yield* Effect.forEach(
      (yield* orchestrationEngine.getReadModel()).threads,
      (thread) => maybeConsumeNextQueuedTurn(thread.id),
      { concurrency: 1 },
    ).pipe(Effect.asVoid);

    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (
          event.type !== "thread.turn-enqueued" &&
          event.type !== "thread.turn-diff-completed" &&
          event.type !== "thread.session-set" &&
          event.type !== "thread.activity-appended"
        ) {
          return Effect.void;
        }

        return processDomainEventSafely(event);
      }),
    );
  });

  return {
    start,
  } satisfies QueuedTurnReactorShape;
});

export const QueuedTurnReactorLive = Layer.effect(
  QueuedTurnReactor,
  makeQueuedTurnReactor,
);
