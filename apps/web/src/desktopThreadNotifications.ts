import type { Project, Thread } from "./types";
import { threadHasPendingApprovals, threadHasUnseenCompletion } from "./threadStatus";

export interface DesktopThreadNotificationEvent {
  kind: "approval-required" | "turn-completed";
  threadId: string;
  title: string;
  body: string;
}

interface ThreadSnapshot {
  pendingApproval: boolean;
  latestCompletedAt: string | null;
  unseenCompletion: boolean;
}

function snapshotThread(thread: Thread): ThreadSnapshot {
  return {
    pendingApproval: threadHasPendingApprovals(thread),
    latestCompletedAt: thread.latestTurn?.completedAt ?? null,
    unseenCompletion: threadHasUnseenCompletion(thread),
  };
}

export function collectDesktopThreadNotificationEvents(input: {
  previousThreads: readonly Thread[];
  nextThreads: readonly Thread[];
  projects: readonly Project[];
}): DesktopThreadNotificationEvent[] {
  const previousById = new Map(input.previousThreads.map((thread) => [thread.id, snapshotThread(thread)]));
  const projectNameById = new Map(input.projects.map((project) => [project.id, project.name] as const));
  const events: DesktopThreadNotificationEvent[] = [];

  for (const thread of input.nextThreads) {
    const previous = previousById.get(thread.id);
    if (!previous) {
      continue;
    }
    const current = snapshotThread(thread);
    const projectName = projectNameById.get(thread.projectId) ?? "Project";

    if (!previous.pendingApproval && current.pendingApproval) {
      events.push({
        kind: "approval-required",
        threadId: thread.id,
        title: "Approval required",
        body: `${thread.title} in ${projectName} is waiting for input.`,
      });
      continue;
    }

    if (
      previous.latestCompletedAt !== current.latestCompletedAt &&
      current.latestCompletedAt !== null &&
      current.unseenCompletion
    ) {
      events.push({
        kind: "turn-completed",
        threadId: thread.id,
        title: "Turn completed",
        body: `${thread.title} in ${projectName} finished running.`,
      });
    }
  }

  return events;
}
