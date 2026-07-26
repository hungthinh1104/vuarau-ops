import { z } from "zod";
import { actorIdSchema, workspaceIdSchema } from "../shared/ids.ts";
import { permissionSchema, workspaceRoleSchema } from "../shared/authorization.ts";

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
