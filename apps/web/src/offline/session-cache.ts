import {
  actorWorkspacesDtoSchema,
  sessionDtoSchema,
  type ActorWorkspacesDto,
  type SessionDto,
  type WorkspaceId,
} from "@vuarau/domain-contracts";

const WORKSPACES_KEY = "vuarau.offline.workspaces";
const sessionKey = (workspaceId: WorkspaceId) => `vuarau.offline.session:${workspaceId}`;

export function cacheWorkspaces(value: ActorWorkspacesDto): void {
  sessionStorage.setItem(WORKSPACES_KEY, JSON.stringify(value));
}

export function cachedWorkspaces(): ActorWorkspacesDto | null {
  const raw = sessionStorage.getItem(WORKSPACES_KEY);
  if (raw === null) return null;
  const parsed = actorWorkspacesDtoSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function cacheSession(workspaceId: WorkspaceId, value: SessionDto): void {
  sessionStorage.setItem(sessionKey(workspaceId), JSON.stringify(value));
}

export function cachedSession(workspaceId: WorkspaceId): SessionDto | null {
  const raw = sessionStorage.getItem(sessionKey(workspaceId));
  if (raw === null) return null;
  const parsed = sessionDtoSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function clearOfflineSessionCache(): void {
  for (const key of Object.keys(sessionStorage)) {
    if (key.startsWith("vuarau.offline.")) sessionStorage.removeItem(key);
  }
}
