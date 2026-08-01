import { z } from "zod";
import {
  addWorkspaceMemberCommandSchema,
  changeWorkspaceMemberRoleCommandSchema,
  reactivateWorkspaceMemberCommandSchema,
  revokeWorkspaceMembershipCommandSchema,
  workspaceIdSchema,
  workspaceDetailInputSchema,
  updateWorkspaceOperationalProfileCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import { revokeWorkspaceMembership } from "../../../modules/session/revoke-membership.handler.ts";
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
} from "../../../modules/session/manage-membership.handler.ts";
import {
  getSession,
  getWorkspaceDetail,
  listActorWorkspaces,
} from "../../../modules/session/session.queries.ts";
import {
  getWorkspaceOperationalProfile,
  updateWorkspaceOperationalProfile,
} from "../../../modules/workspace-profile/workspace-profile.ts";

export const sessionRouter = router({
  me: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema }))
    .query(async ({ ctx, input }) => unwrap(await getSession(ctx, input.workspaceId))),

  /**
   * The depots this caller may act in — asked before `me`, because a client
   * cannot ask "what may I do here" until it knows what "here" can be.
   *
   * **The input is empty on purpose.** An `actorId` field would be a field to
   * tamper with; the answer comes from the verified token instead (BR-AUTH-008).
   *
   * `strictObject` rather than `object`: a caller who sends `{ actorId }` is told
   * so. A silently dropped field is a field somebody eventually believes in, and
   * "I asked for their workspaces and got mine" is the sort of surprise that ends
   * with a client writing its own filter.
   */
  workspaces: authenticatedProcedure
    .input(z.strictObject({}))
    .query(async ({ ctx }) => unwrap(await listActorWorkspaces(ctx))),

  /**
   * Revocation takes effect on the **next request**: membership is re-read on
   * every command and every query, so there is no session to expire.
   */
  revokeMembership: commandProcedure
    .input(revokeWorkspaceMembershipCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await revokeWorkspaceMembership(ctx, input))),

  workspace: authenticatedProcedure
    .input(workspaceDetailInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getWorkspaceDetail(ctx, input.workspaceId))),

  addMember: commandProcedure
    .input(addWorkspaceMemberCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await addWorkspaceMember(ctx, input))),

  changeMemberRole: commandProcedure
    .input(changeWorkspaceMemberRoleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await changeWorkspaceMemberRole(ctx, input))),

  operationalProfile: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await getWorkspaceOperationalProfile(ctx, input.workspaceId)),
    ),

  updateOperationalProfile: commandProcedure
    .input(updateWorkspaceOperationalProfileCommandSchema)
    .mutation(async ({ ctx, input }) =>
      unwrap(await updateWorkspaceOperationalProfile(ctx, input)),
    ),

  reactivateMember: commandProcedure
    .input(reactivateWorkspaceMemberCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateWorkspaceMember(ctx, input))),
});
