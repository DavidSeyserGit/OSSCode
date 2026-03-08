import type { Project } from "./types";

const DESKTOP_RECENT_PROJECTS_KEY = "osscode:desktop-recent-projects:v1";
const MAX_RECENT_PROJECTS = 6;

export interface DesktopRecentProject {
  cwd: string;
  name: string;
  lastUsedAt: string;
}

function normalizeRecentProjects(
  value: unknown,
  currentProjects: readonly Project[] = [],
): DesktopRecentProject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const currentCwds = new Set(currentProjects.map((project) => project.cwd));
  const deduped = new Map<string, DesktopRecentProject>();

  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const cwd = typeof candidate.cwd === "string" ? candidate.cwd.trim() : "";
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const lastUsedAt =
      typeof candidate.lastUsedAt === "string" ? candidate.lastUsedAt.trim() : "";
    if (cwd.length === 0 || name.length === 0 || lastUsedAt.length === 0) {
      continue;
    }
    if (currentCwds.has(cwd)) {
      continue;
    }
    const existing = deduped.get(cwd);
    if (!existing || existing.lastUsedAt < lastUsedAt) {
      deduped.set(cwd, { cwd, name, lastUsedAt });
    }
  }

  return [...deduped.values()]
    .toSorted((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt))
    .slice(0, MAX_RECENT_PROJECTS);
}

export function readDesktopRecentProjects(
  currentProjects: readonly Project[] = [],
): DesktopRecentProject[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(DESKTOP_RECENT_PROJECTS_KEY);
    if (!raw) {
      return [];
    }
    return normalizeRecentProjects(JSON.parse(raw), currentProjects);
  } catch {
    return [];
  }
}

export function persistDesktopRecentProjects(projects: readonly Project[]): DesktopRecentProject[] {
  if (typeof window === "undefined") {
    return [];
  }

  const existing = readDesktopRecentProjects();
  const now = new Date().toISOString();
  const merged = normalizeRecentProjects(
    [
      ...projects.map((project) => ({
        cwd: project.cwd,
        name: project.name,
        lastUsedAt: now,
      })),
      ...existing,
    ],
    [],
  );

  try {
    window.localStorage.setItem(DESKTOP_RECENT_PROJECTS_KEY, JSON.stringify(merged));
  } catch {
    // Ignore local storage write errors.
  }

  return normalizeRecentProjects(merged, projects);
}
