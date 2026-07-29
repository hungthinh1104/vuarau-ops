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

export function cacheWorkspaces(subject: string, value: ActorWorkspacesDto): void {
  sessionStorage.setItem(workspacesKey(subject), JSON.stringify(value));
}

export function cachedWorkspaces(subject: string): ActorWorkspacesDto | null {
  const raw = sessionStorage.getItem(workspacesKey(subject));
  if (raw === null) return null;
  const parsed = actorWorkspacesDtoSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function cacheSession(subject: string, workspaceId: WorkspaceId, value: SessionDto): void {
  sessionStorage.setItem(sessionKey(subject, workspaceId), JSON.stringify(value));
}

export function cachedSession(subject: string, workspaceId: WorkspaceId): SessionDto | null {
  const raw = sessionStorage.getItem(sessionKey(subject, workspaceId));
  if (raw === null) return null;
  const parsed = sessionDtoSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function clearOfflineSessionCache(subject: string): void {
  const prefix = `vuarau.offline.${subjectKey(subject)}.`;
  for (const key of Object.keys(sessionStorage)) {
    if (
      key.startsWith(prefix) ||
      key === "vuarau.offline.workspaces" ||
      key.startsWith("vuarau.offline.session:")
    ) {
      sessionStorage.removeItem(key);
    }
  }
}
