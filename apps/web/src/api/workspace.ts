import type { WorkspaceId } from "@vuarau/domain-contracts";
import { workspaceIdSchema } from "@vuarau/domain-contracts";

/**
 * Which depot the app is writing into, chosen explicitly and stored per tab.
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
 * What is kept here is the **selection**: which of the discovered depots this tab
 * is working in.
 */
const SELECTION_KEY = "vuarau.workspace_id";

export function storedWorkspaceId(): WorkspaceId | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SELECTION_KEY);
    if (raw === null) return null;
    const parsed = workspaceIdSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function storeWorkspaceId(workspaceId: WorkspaceId | null): void {
  if (typeof window === "undefined") return;
  try {
    if (workspaceId === null) window.sessionStorage.removeItem(SELECTION_KEY);
    else window.sessionStorage.setItem(SELECTION_KEY, workspaceId);
  } catch {
    // Storage unavailable: the choice lasts the page rather than the tab.
  }
}
