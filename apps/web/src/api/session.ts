import type { Permission, SessionDto, WorkspaceId } from "@vuarau/domain-contracts";
import { sessionDtoSchema } from "@vuarau/domain-contracts";

/**
 * The typed session bootstrap: everything the shell needs before it can render a
 * single control, and nothing it can work out for itself.
 *
 * `session.me` returns the caller's role **and their expanded permission set**,
 * so the client never holds a copy of the role table. A client that mapped
 * "accountant" to a permission list would disagree with the server the day the
 * table changed, and would disagree silently (ADR-0011).
 */
export type Session = {
  readonly session: SessionDto;
  readonly workspaceId: WorkspaceId;
};

/** Validating what came back, not trusting it. A DTO that drifted fails here. */
export function parseSession(raw: unknown): SessionDto {
  return sessionDtoSchema.parse(raw);
}

/**
 * Whether a menu item should exist at all.
 *
 * The other half of the answer — whether the control should be *enabled* for this
 * particular sale or payment — is on the DTO
 * (docs/06-api-contracts/capabilities.md). Both are needed: sale and payment
 * capabilities are computed in the domain kernel, which by construction does not
 * know who is asking, so a UI reading only `capabilities.void.allowed` would offer
 * a void button to a `sales` worker.
 */
export function hasPermission(session: SessionDto, permission: Permission): boolean {
  return session.permissions.includes(permission);
}

/**
 * Workspace selection is **explicit**, and this is where that is enforced.
 *
 * There is deliberately no `firstWorkspace()` and no "if there is only one, use
 * it". Every command and every read is scoped by `workspaceId` (BR-CUSTOMER-002),
 * and a silently chosen workspace is a silently chosen set of books. Somebody who
 * keeps two depots must be shown which one they are recording against, every time.
 */
export type WorkspaceSelection =
  | { readonly kind: "none_selected"; readonly available: readonly WorkspaceChoice[] }
  | { readonly kind: "selected"; readonly workspaceId: WorkspaceId };

export type WorkspaceChoice = {
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
};

export function selectWorkspace(
  available: readonly WorkspaceChoice[],
  chosen: WorkspaceId | null,
): WorkspaceSelection {
  if (chosen === null) {
    return { kind: "none_selected", available };
  }
  const match = available.find((choice) => choice.workspaceId === chosen);
  // A stored id that is no longer available — access revoked, or a stale
  // bookmark — falls back to asking, never to picking a different depot.
  return match === undefined
    ? { kind: "none_selected", available }
    : { kind: "selected", workspaceId: match.workspaceId };
}
