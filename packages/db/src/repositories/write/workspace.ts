import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  ActorId,
  WorkspaceId,
  WorkspaceOperationalProfileDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { normalizeWorkspaceRoles, primaryWorkspaceRole } from "@vuarau/domain-contracts";
import {
  actors,
  workspaceMembershipRoles,
  workspaceMemberships,
  workspaceOperationalProfiles,
  workspaces,
} from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

function sameRoles(left: readonly WorkspaceRole[], right: readonly WorkspaceRole[]): boolean {
  const a = normalizeWorkspaceRoles(left);
  const b = normalizeWorkspaceRoles(right);
  return a.length === b.length && a.every((role, index) => role === b[index]);
}

async function rolesByActor(
  tx: Tx,
  workspaceId: WorkspaceId,
  actorIds: readonly ActorId[],
): Promise<Map<ActorId, readonly WorkspaceRole[]>> {
  if (actorIds.length === 0) return new Map();
  const rows = await tx
    .select({ actorId: workspaceMembershipRoles.actorId, role: workspaceMembershipRoles.role })
    .from(workspaceMembershipRoles)
    .where(
      and(
        eq(workspaceMembershipRoles.workspaceId, workspaceId),
        inArray(workspaceMembershipRoles.actorId, [...actorIds]),
      ),
    )
    .orderBy(asc(workspaceMembershipRoles.role));
  const grouped = new Map<ActorId, WorkspaceRole[]>();
  for (const row of rows) {
    const actorId = row.actorId as ActorId;
    const roles = grouped.get(actorId) ?? [];
    roles.push(row.role);
    grouped.set(actorId, roles);
  }
  return new Map(
    [...grouped.entries()].map(([actorId, roles]) => [actorId, normalizeWorkspaceRoles(roles)]),
  );
}

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

    async findOperationalProfile(
      workspaceId: WorkspaceId,
    ): Promise<WorkspaceOperationalProfileDto | null> {
      const rows = await tx
        .select({
          purchasingMode: workspaceOperationalProfiles.purchasingMode,
          inventoryMode: workspaceOperationalProfiles.inventoryMode,
          qualityGradeMode: workspaceOperationalProfiles.qualityGradeMode,
          deliveryMode: workspaceOperationalProfiles.deliveryMode,
          cashbookMode: workspaceOperationalProfiles.cashbookMode,
          intakeMode: workspaceOperationalProfiles.intakeMode,
          weighingMode: workspaceOperationalProfiles.weighingMode,
          businessDayStartMinute: workspaceOperationalProfiles.businessDayStartMinute,
          version: workspaceOperationalProfiles.version,
        })
        .from(workspaceOperationalProfiles)
        .where(eq(workspaceOperationalProfiles.workspaceId, workspaceId))
        .limit(1);
      const row = rows[0];
      return row === undefined ? null : { workspaceId, ...row };
    },

    async updateOperationalProfile(
      profile: WorkspaceOperationalProfileDto,
      expectedVersion: number,
    ): Promise<boolean> {
      const values = {
        purchasingMode: profile.purchasingMode,
        inventoryMode: profile.inventoryMode,
        qualityGradeMode: profile.qualityGradeMode,
        deliveryMode: profile.deliveryMode,
        cashbookMode: profile.cashbookMode,
        intakeMode: profile.intakeMode,
        weighingMode: profile.weighingMode,
        businessDayStartMinute: profile.businessDayStartMinute,
        version: profile.version,
        updatedAt: new Date(),
      };
      const rows = await tx
        .update(workspaceOperationalProfiles)
        .set(values)
        .where(
          and(
            eq(workspaceOperationalProfiles.workspaceId, profile.workspaceId),
            eq(workspaceOperationalProfiles.version, expectedVersion),
          ),
        )
        .returning({ workspaceId: workspaceOperationalProfiles.workspaceId });
      if (rows.length === 1) return true;
      if (expectedVersion !== 1) return false;
      const inserted = await tx
        .insert(workspaceOperationalProfiles)
        .values({ workspaceId: profile.workspaceId, ...values })
        .onConflictDoNothing()
        .returning({ workspaceId: workspaceOperationalProfiles.workspaceId });
      return inserted.length === 1;
    },

    async findMembership(workspaceId: WorkspaceId, actorId: ActorId) {
      const rows = await tx
        .select({ role: workspaceMemberships.role, isActive: workspaceMemberships.isActive })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (row === undefined) return null;
      const grouped = await rolesByActor(tx, workspaceId, [actorId]);
      const roles = grouped.get(actorId) ?? [row.role];
      return {
        workspaceId,
        actorId,
        role: primaryWorkspaceRole(roles),
        roles,
        isActive: row.isActive,
      };
    },

    async countActiveOwnersForUpdate(workspaceId: WorkspaceId): Promise<number> {
      // `owner` is exclusive and remains the transitional primary projection, so
      // locking these membership rows preserves the established last-owner race guard.
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
      const grouped = await rolesByActor(
        tx,
        workspaceId,
        rows.map((row) => row.actorId as ActorId),
      );
      return rows.map((row) => {
        const actorId = row.actorId as ActorId;
        const roles = grouped.get(actorId) ?? [row.role];
        return {
          workspaceId,
          actorId,
          displayName: row.displayName,
          role: primaryWorkspaceRole(roles),
          roles,
          isActive: row.isActive,
          createdAt: toIso(row.createdAt),
        };
      });
    },

    async addMembership(
      workspaceId: WorkspaceId,
      actorId: ActorId,
      inputRoles: readonly WorkspaceRole[],
      assignedBy: ActorId,
    ): Promise<boolean> {
      const roles = normalizeWorkspaceRoles(inputRoles);
      const inserted = await tx
        .insert(workspaceMemberships)
        .values({
          workspaceId,
          actorId,
          role: primaryWorkspaceRole(roles),
          isActive: true,
        })
        .onConflictDoNothing()
        .returning({ actorId: workspaceMemberships.actorId });
      if (inserted.length !== 1) return false;
      await tx
        .insert(workspaceMembershipRoles)
        .values(roles.map((role) => ({ workspaceId, actorId, role, assignedBy })));
      return true;
    },

    async changeMembershipRoles(
      workspaceId: WorkspaceId,
      actorId: ActorId,
      expectedRoles: readonly WorkspaceRole[],
      inputRoles: readonly WorkspaceRole[],
      assignedBy: ActorId,
    ): Promise<boolean> {
      const membershipRows = await tx
        .select({ role: workspaceMemberships.role })
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
            eq(workspaceMemberships.isActive, true),
          ),
        )
        .for("update")
        .limit(1);
      const membership = membershipRows[0];
      if (membership === undefined) return false;
      const grouped = await rolesByActor(tx, workspaceId, [actorId]);
      const currentRoles = grouped.get(actorId) ?? [membership.role];
      if (!sameRoles(currentRoles, expectedRoles)) return false;

      const roles = normalizeWorkspaceRoles(inputRoles);
      await tx
        .update(workspaceMemberships)
        .set({ role: primaryWorkspaceRole(roles) })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspaceId),
            eq(workspaceMemberships.actorId, actorId),
          ),
        );
      await tx
        .delete(workspaceMembershipRoles)
        .where(
          and(
            eq(workspaceMembershipRoles.workspaceId, workspaceId),
            eq(workspaceMembershipRoles.actorId, actorId),
          ),
        );
      await tx
        .insert(workspaceMembershipRoles)
        .values(roles.map((role) => ({ workspaceId, actorId, role, assignedBy })));
      return true;
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

    async listActiveWorkspaces(actorId: ActorId) {
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

      return Promise.all(
        rows.map(async (row) => {
          const workspaceId = row.workspaceId as WorkspaceId;
          const grouped = await rolesByActor(tx, workspaceId, [actorId]);
          const roles = grouped.get(actorId) ?? [row.role];
          return {
            workspaceId,
            workspaceName: row.workspaceName,
            role: primaryWorkspaceRole(roles),
            roles,
          };
        }),
      );
    },
  },
});
