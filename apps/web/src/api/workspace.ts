import type { WorkspaceId } from "@vuarau/domain-contracts";
import { workspaceIdSchema } from "@vuarau/domain-contracts";

/**
 * Which depot the app is writing into, chosen explicitly and stored per
 * authenticated subject within this tab.
 *
 * Every command and every read is scoped by `workspaceId` (BR-CUSTOMER-002), so a
 * silently chosen workspace is a silently chosen set of books. There is
 * deliberately no "if there is only one, use it": somebody who keeps two depots
 * must see which one they are recording against, every time.
 *
 * The list of choices is **discovered**, from `session.workspaces` (BR-AUTH-008).
 * It used to be configured, as `NEXT_PUBLIC_WORKSPACES` — a build-time variable
 * naming ids and labels. That made the browser the author of a claim only the
 * server can make: whoever deployed the frontend decided which depots appeared,
 * and adding one to a pilot meant a rebuild. The variable is gone rather than kept
 * as a fallback, because a second source for "which depots exist" is a second
 * answer to it.
 *
 * What is kept here is the **selection**: which of the discovered depots this
 * subject is working in. It is durable across a tab/process restart so an
 * already queued offline workflow can reopen after the worker signs in again.
 * The subject is part of the key, and logout clears it, so another person using
 * the same device cannot inherit it.
 */
export const WORKSPACE_SELECTION_PREFIX = "vuarau.workspace_id:";
const legacySelectionKey = "vuarau.workspace_id";
const selectionKey = (subject: string) =>
  `${WORKSPACE_SELECTION_PREFIX}${encodeURIComponent(subject)}`;

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

export function storedWorkspaceId(subject: string): WorkspaceId | null {
  if (typeof window === "undefined") return null;
  for (const storage of storageAreas()) {
    try {
      const raw = storage.getItem(selectionKey(subject));
      if (raw === null) continue;
      const parsed = workspaceIdSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // Try the other storage area when this browser blocks one of them.
    }
  }
  return null;
}

export function storeWorkspaceId(subject: string, workspaceId: WorkspaceId | null): void {
  if (typeof window === "undefined") return;
  const key = selectionKey(subject);
  if (workspaceId === null) {
    clearWorkspaceSelection(subject);
    return;
  }
  try {
    window.localStorage.setItem(key, workspaceId);
    window.sessionStorage.removeItem(key);
  } catch {
    try {
      window.sessionStorage.setItem(key, workspaceId);
    } catch {
      // Storage unavailable: the choice lasts only for the current React tree.
    }
  }
}

export function clearWorkspaceSelection(subject: string): void {
  if (typeof window === "undefined") return;
  for (const storage of storageAreas()) {
    try {
      storage.removeItem(selectionKey(subject));
      // Remove the pre-subject key so an upgraded tab cannot inherit it.
      storage.removeItem(legacySelectionKey);
    } catch {
      // Storage unavailable means there is no persisted selection to clear.
    }
  }
}
