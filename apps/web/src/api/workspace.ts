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
 * subject is working in. The subject is part of the key so the next person using
 * the same tab cannot inherit it.
 */
export const WORKSPACE_SELECTION_PREFIX = "vuarau.workspace_id:";
const legacySelectionKey = "vuarau.workspace_id";
const selectionKey = (subject: string) =>
  `${WORKSPACE_SELECTION_PREFIX}${encodeURIComponent(subject)}`;

export function storedWorkspaceId(subject: string): WorkspaceId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(selectionKey(subject));
    if (raw === null) return null;
    const parsed = workspaceIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function storeWorkspaceId(subject: string, workspaceId: WorkspaceId | null): void {
  if (typeof window === "undefined") return;
  try {
    if (workspaceId === null) window.sessionStorage.removeItem(selectionKey(subject));
    else window.sessionStorage.setItem(selectionKey(subject), workspaceId);
  } catch {
    // Storage unavailable: the choice lasts the page rather than the tab.
  }
}

export function clearWorkspaceSelection(subject: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(selectionKey(subject));
    // Remove the pre-subject key so an upgraded tab cannot inherit it.
    window.sessionStorage.removeItem(legacySelectionKey);
  } catch {
    // Storage unavailable means there is no persisted selection to clear.
  }
}
