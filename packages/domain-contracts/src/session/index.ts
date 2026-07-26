import { z } from "zod";
import { actorIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { permissionSchema, workspaceRoleSchema } from "../shared/authorization.ts";
import { defineCommand } from "../shared/command.ts";

/**
 * UC-AUTH-003 — what the caller may do, before they have any particular sale or
 * customer in hand.
 *
 * A UI has to decide which controls exist before it can read anything. Without
 * this the client would infer the answer from the role name, growing its own copy
 * of the role table, which then drifts from the server's (ADR-0011).
 *
 * Two kinds of capability, and the difference matters:
 *
 *   session capability   depends on who is asking      "may I void sales at all"
 *   aggregate capability depends on the thing's state  "may I void *this* sale"
 *
 * This carries the first. Every DTO carries the second. A menu item needs the
 * first to exist; a button needs the second to be enabled.
 */
export const sessionDtoSchema = z.object({
  actorId: actorIdSchema,
  workspaceId: workspaceIdSchema,
  role: workspaceRoleSchema,
  /**
   * The caller's full permission set, expanded from their role. Sent as a list
   * rather than as the role name so that a client never has to know the mapping —
   * the mapping is the server's, and a client that hard-codes it is a client that
   * silently disagrees the day it changes.
   */
  permissions: z.array(permissionSchema),
});
export type SessionDto = z.infer<typeof sessionDtoSchema>;

/**
 * UC-AUTH-002 — revoking a workspace membership.
 *
 * Sets `is_active = false`. It does **not** delete the membership row, and it
 * does not touch anything that person recorded: their sales stand, their payments
 * stand, and every account entry still names them (BR-ACCOUNT-004). An audit trail
 * has to keep working after somebody leaves, which is when it is most needed.
 *
 * No `expectedVersion`. A membership has no user-editable content to lose an
 * update of — the command sets one boolean to one value — and two concurrent
 * revocations of the same person want the same end state. The race that *does*
 * matter is two owners revoking each other simultaneously, and a version would
 * not catch that; a row lock over the active-owner count does (BR-AUTH-007).
 */
export const revokeWorkspaceMembershipPayloadSchema = z.object({
  actorId: actorIdSchema,
  reason: z.string().trim().max(500).nullable().default(null),
});
export type RevokeWorkspaceMembershipPayload = z.infer<
  typeof revokeWorkspaceMembershipPayloadSchema
>;

export const revokeWorkspaceMembershipCommandSchema = defineCommand(
  revokeWorkspaceMembershipPayloadSchema,
);
export type RevokeWorkspaceMembershipCommand = z.infer<
  typeof revokeWorkspaceMembershipCommandSchema
>;

export const workspaceMembershipDtoSchema = z.object({
  workspaceId: workspaceIdSchema,
  actorId: actorIdSchema,
  role: workspaceRoleSchema,
  isActive: z.boolean(),
});
export type WorkspaceMembershipDto = z.infer<typeof workspaceMembershipDtoSchema>;
