import { and, asc, eq } from "drizzle-orm";
import type { ActorId, WorkspaceId, WorkspaceRole } from "@vuarau/domain-contracts";
import { actors, workspaceMemberships, workspaces } from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createWorkspaceWriteRepositories = (tx: Tx) => ({
  workspaces: {
    async findName(workspaceId: WorkspaceId): Promise<string | null> {
      const rows = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
      return rows[0]?.name ?? null;
    },
    // Note the absence of an `is_active` filter: the caller needs to see a
    // revoked membership to answer WORKSPACE_MEMBERSHIP_INACTIVE rather than
    // the misleading WORKSPACE_ACCESS_DENIED.
    async findMembership(workspaceId: WorkspaceId, actorId: ActorId) {
      const rows = await tx
        .select({
          role: workspaceMemberships.role,
          isActive: workspaceMemberships.isActive,
        })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
          ),
        )
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : { workspaceId, actorId, role: row.role, isActive: row.isActive };
    },

    async countActiveOwnersForUpdate(workspaceId: WorkspaceId): Promise<number> {
      // Locked, not counted: two owners revoking each other simultaneously must
      // not both read two (BR-AUTH-007). `FOR UPDATE` on the rows is what
      // serialises them; a count without it is a snapshot either can win from.
      const rows = await tx
        .select({ actorId: workspaceMemberships.actorId })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.role, "owner"),
            eq(workspaceMemberships.isActive, true),
          ),
        )
        .for("update");
      return rows.length;
    },

    async revokeMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean> {
      const updated = await tx
        .update(workspaceMemberships)
        .set({ isActive: false })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
            eq(workspaceMemberships.isActive, true),
          ),
        )
        .returning({ actorId: workspaceMemberships.actorId });
      return updated.length === 1;
    },

    async listMembers(workspaceId: WorkspaceId) {
      const rows = await tx
        .select({
          actorId: workspaceMemberships.actorId,
          displayName: actors.displayName,
          role: workspaceMemberships.role,
          isActive: workspaceMemberships.isActive,
          createdAt: workspaceMemberships.createdAt,
        })
        .from(workspaceMemberships)
        .innerJoin(actors, eq(actors.id, workspaceMemberships.actorId))
        .where(eq(workspaceMemberships.workspaceId, workspaceId))
        .orderBy(asc(actors.displayName), asc(actors.id));
      return rows.map((row) => ({
        workspaceId,
        actorId: row.actorId,
        displayName: row.displayName,
        role: row.role,
        isActive: row.isActive,
        createdAt: toIso(row.createdAt),
      }));
    },

    async addMembership(
      workspaceId: WorkspaceId,
      actorId: ActorId,
      role: WorkspaceRole,
    ): Promise<boolean> {
      const rows = await tx
        .insert(workspaceMemberships)
        .values({ workspaceId, actorId, role, isActive: true })
        .onConflictDoNothing()
        .returning({ actorId: workspaceMemberships.actorId });
      return rows.length === 1;
    },

    async changeMembershipRole(
      workspaceId: WorkspaceId,
      actorId: ActorId,
      expectedRole: WorkspaceRole,
      role: WorkspaceRole,
    ): Promise<boolean> {
      const rows = await tx
        .update(workspaceMemberships)
        .set({ role })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
            eq(workspaceMemberships.role, expectedRole),
            eq(workspaceMemberships.isActive, true),
          ),
        )
        .returning({ actorId: workspaceMemberships.actorId });
      return rows.length === 1;
    },

    async reactivateMembership(workspaceId: WorkspaceId, actorId: ActorId): Promise<boolean> {
      const rows = await tx
        .update(workspaceMemberships)
        .set({ isActive: true })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
            eq(workspaceMemberships.isActive, false),
          ),
        )
        .returning({ actorId: workspaceMemberships.actorId });
      return rows.length === 1;
    },
  },
  actors: {
    async findBySupabaseUserId(supabaseUserId: string) {
      const rows = await tx
        .select({ id: actors.id })
        .from(actors)
        .where(eq(actors.supabaseUserId, supabaseUserId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : { actorId: row.id as ActorId };
    },

    async findById(actorId: ActorId) {
      const rows = await tx
        .select({ id: actors.id, displayName: actors.displayName })
        .from(actors)
        .where(eq(actors.id, actorId))
        .limit(1);
      const row = rows[0];
      return row === undefined
        ? null
        : { actorId: row.id as ActorId, displayName: row.displayName };
    },

    /**
     * The one query that spans workspaces, and the only one that may
     * (BR-AUTH-008). It is filtered by `actor_id` — never by anything from a
     * request — and by `is_active`, so a revoked membership disappears from the
     * picker on the next load rather than offering a door onto a refusal.
     *
     * Ordered by `(name, id)` so two calls agree and a picker does not reshuffle
     * under somebody's thumb. The join is inner: a membership whose workspace row
     * is gone is not a depot anybody can be shown.
     */
    async listActiveWorkspaces(
      actorId: ActorId,
    ): Promise<
      readonly { workspaceId: WorkspaceId; workspaceName: string; role: WorkspaceRole }[]
    > {
      const rows = await tx
        .select({
          workspaceId: workspaces.id,
          workspaceName: workspaces.name,
          role: workspaceMemberships.role,
        })
        .from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(
          and(eq(workspaceMemberships.actorId, actorId), eq(workspaceMemberships.isActive, true)),
        )
        .orderBy(asc(workspaces.name), asc(workspaces.id));

      return rows.map((row) => ({
        workspaceId: row.workspaceId as WorkspaceId,
        workspaceName: row.workspaceName,
        role: row.role,
      }));
    },
  },
});
