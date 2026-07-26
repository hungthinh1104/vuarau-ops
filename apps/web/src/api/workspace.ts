import type { WorkspaceId } from "@vuarau/domain-contracts";
import { workspaceIdSchema } from "@vuarau/domain-contracts";
import type { WorkspaceChoice } from "./session.ts";

/**
 * Which depot the app is writing into, chosen explicitly and stored per tab.
 *
 * Every command and every read is scoped by `workspaceId` (BR-CUSTOMER-002), so a
 * silently chosen workspace is a silently chosen set of books. There is
 * deliberately no "if there is only one, use it": somebody who keeps two depots
 * must see which one they are recording against, every time.
 *
 * The list of choices is **configured**, not discovered. The API has no
 * `workspace.list` procedure, and inventing one to make this screen easier would
 * be redesigning the backend for the frontend's convenience. Recorded as a gap in
 * docs/00-product/validation-plan.md instead.
 */
const SELECTION_KEY = "vuarau.workspace_id";

/**
 * `NEXT_PUBLIC_WORKSPACES` is `id:Tên vựa` pairs separated by `|`.
 *
 * Read through a schema rather than trusted: a malformed environment variable
 * should produce no choices and an honest "chưa cấu hình", not a uuid-shaped
 * string sent to the server as a tenant boundary.
 */
export function configuredWorkspaces(raw: string | undefined): readonly WorkspaceChoice[] {
  if (raw === undefined || raw.trim().length === 0) return [];

  return raw
    .split("|")
    .map((entry) => {
      const separator = entry.indexOf(":");
      if (separator < 0) return null;
      const parsed = workspaceIdSchema.safeParse(entry.slice(0, separator).trim());
      const displayName = entry.slice(separator + 1).trim();
      if (!parsed.success || displayName.length === 0) return null;
      return { workspaceId: parsed.data, displayName };
    })
    .filter((choice): choice is WorkspaceChoice => choice !== null);
}

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
