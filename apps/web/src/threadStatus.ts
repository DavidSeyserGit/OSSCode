import type { Thread } from "./types";
import { derivePendingApprovals } from "./session-logic";

export function threadHasPendingApprovals(thread: Thread): boolean {
  return derivePendingApprovals(thread.activities).length > 0;
}

export function threadHasUnseenCompletion(thread: Thread): boolean {
  if (!thread.latestTurn?.completedAt) return false;
  const completedAt = Date.parse(thread.latestTurn.completedAt);
  if (Number.isNaN(completedAt)) return false;
  if (!thread.lastVisitedAt) return true;

  const lastVisitedAt = Date.parse(thread.lastVisitedAt);
  if (Number.isNaN(lastVisitedAt)) return true;
  return completedAt > lastVisitedAt;
}
