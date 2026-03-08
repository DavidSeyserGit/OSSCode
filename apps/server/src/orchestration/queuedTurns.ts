import type { OrchestrationReadModel } from "@t3tools/contracts";

type Thread = OrchestrationReadModel["threads"][number];

export function hasOpenThreadApprovalOrUserInput(
  activities: Thread["activities"],
): boolean {
  const openApprovalRequestIds = new Set<string>();
  const openUserInputRequestIds = new Set<string>();

  for (const activity of activities) {
    const payload =
      activity.payload && typeof activity.payload === "object"
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId = payload && typeof payload.requestId === "string" ? payload.requestId : null;
    if (!requestId) {
      continue;
    }

    if (activity.kind === "approval.requested") {
      openApprovalRequestIds.add(requestId);
      continue;
    }
    if (activity.kind === "approval.resolved") {
      openApprovalRequestIds.delete(requestId);
      continue;
    }
    if (activity.kind === "user-input.requested") {
      openUserInputRequestIds.add(requestId);
      continue;
    }
    if (activity.kind === "user-input.resolved") {
      openUserInputRequestIds.delete(requestId);
    }
  }

  return openApprovalRequestIds.size > 0 || openUserInputRequestIds.size > 0;
}

export function shouldEnqueueNewThreadTurn(thread: Thread): boolean {
  return (
    thread.session?.status === "starting" ||
    thread.session?.status === "running" ||
    hasOpenThreadApprovalOrUserInput(thread.activities)
  );
}

export function canConsumeQueuedThreadTurn(thread: Thread): boolean {
  if (thread.queuedTurns.length === 0) {
    return false;
  }
  if (thread.session?.status === "starting" || thread.session?.status === "running") {
    return false;
  }
  if (hasOpenThreadApprovalOrUserInput(thread.activities)) {
    return false;
  }
  if (thread.latestTurn === null || thread.latestTurn.completedAt === null) {
    return false;
  }
  return thread.latestTurn.state === "completed" || thread.latestTurn.state === "interrupted";
}
