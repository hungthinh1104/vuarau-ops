import {
  actorWorkspacesDtoSchema,
  sessionDtoSchema,
  type ActorWorkspacesDto,
  type SessionDto,
  type WorkspaceId,
} from "@vuarau/domain-contracts";

const subjectKey = (subject: string) => encodeURIComponent(subject);
const workspacesKey = (subject: string) => `vuarau.offline.${subjectKey(subject)}.workspaces`;
const sessionKey = (subject: string, workspaceId: WorkspaceId) =>
  `vuarau.offline.${subjectKey(subject)}.session:${workspaceId}`;

function storageAreas(): Storage[] {
  if (typeof window === "undefined") return [];
  const areas: Storage[] = [];
  for (const getStorage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      areas.push(getStorage());
    } catch {
      // A browser may block one storage area while leaving the other available.
    }
  }
  return areas;
}

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  // These DTOs are non-secret, subject-scoped bootstrap hints. Keep them
  // durable so a restarted tab can reopen an already queued offline workflow.
  for (const storage of storageAreas()) {
    try {
      const value = storage.getItem(key);
      if (value !== null) return value;
    } catch {
      // Private browsing or a blocked storage area should not break the app.
    }
  }
  return null;
}

function writeStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
    window.sessionStorage.removeItem(key);
    return;
  } catch {
    // Fall back to tab storage when durable storage is unavailable.
  }
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Storage unavailable means the cache simply cannot be written.
  }
}

function removeStorageKey(key: string): void {
  if (typeof window === "undefined") return;
  for (const storage of storageAreas()) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage unavailable already means there is nothing reliable to remove.
    }
  }
}

export function cacheWorkspaces(subject: string, value: ActorWorkspacesDto): void {
  writeStorage(workspacesKey(subject), JSON.stringify(value));
}

export function cachedWorkspaces(subject: string): ActorWorkspacesDto | null {
  const raw = readStorage(workspacesKey(subject));
  if (raw === null) return null;
  try {
    const parsed = actorWorkspacesDtoSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function cacheSession(subject: string, workspaceId: WorkspaceId, value: SessionDto): void {
  writeStorage(sessionKey(subject, workspaceId), JSON.stringify(value));
}

export function cachedSession(subject: string, workspaceId: WorkspaceId): SessionDto | null {
  const raw = readStorage(sessionKey(subject, workspaceId));
  if (raw === null) return null;
  try {
    const parsed = sessionDtoSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearOfflineSessionCache(subject: string): void {
  const prefix = `vuarau.offline.${subjectKey(subject)}.`;
  if (typeof window === "undefined") return;
  for (const storage of storageAreas()) {
    try {
      for (const key of Object.keys(storage)) {
        if (
          key.startsWith(prefix) ||
          key === "vuarau.offline.workspaces" ||
          key.startsWith("vuarau.offline.session:")
        ) {
          removeStorageKey(key);
        }
      }
    } catch {
      // Storage unavailable already means there is no browser authority to clear.
    }
  }
}
