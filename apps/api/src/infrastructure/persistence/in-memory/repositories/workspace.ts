import type { Repositories } from "../../ports.ts";
import type { IsoInstant } from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createWorkspaceRepositories = (
  store: Store,
): Pick<Repositories, "workspaces" | "actors"> => ({
  workspaces: {
    findName: async (workspaceId) => store.workspaceNames.get(workspaceId) ?? null,
    // Returns inactive memberships too — the same semantics as the Drizzle
    // implementation, which this deliberately mirrors. Before Milestone 1 the
    // two disagreed about `is_active` and no application test could have
    // caught it.
    findMembership: async (workspaceId, actorId) =>
      store.memberships.get(key(workspaceId, actorId)) ?? null,

    countActiveOwnersForUpdate: async (workspaceId) =>
      [...store.memberships.values()].filter(
        (membership) =>
          membership.workspaceId === workspaceId &&
          membership.role === "owner" &&
          membership.isActive,
      ).length,

    revokeMembership: async (workspaceId, actorId) => {
      const membership = store.memberships.get(key(workspaceId, actorId));
      if (membership === undefined || !membership.isActive) {
        return false;
      }
      store.memberships.set(key(workspaceId, actorId), { ...membership, isActive: false });
      return true;
    },

    listMembers: async (workspaceId) =>
      [...store.memberships.values()]
        .filter((membership) => membership.workspaceId === workspaceId)
        .flatMap((membership) => {
          const displayName = store.actorNames.get(membership.actorId);
          return displayName === undefined ? [] : [{ ...membership, displayName }];
        })
        .sort((a, b) =>
          a.displayName === b.displayName
            ? a.actorId.localeCompare(b.actorId)
            : a.displayName.localeCompare(b.displayName),
        ),

    addMembership: async (workspaceId, actorId, role) => {
      const membershipKey = key(workspaceId, actorId);
      if (store.memberships.has(membershipKey)) return false;
      store.memberships.set(membershipKey, {
        workspaceId,
        actorId,
        role,
        isActive: true,
        createdAt: "2026-01-01T00:00:00.000Z" as IsoInstant,
      });
      return true;
    },

    changeMembershipRole: async (workspaceId, actorId, expectedRole, role) => {
      const membershipKey = key(workspaceId, actorId);
      const membership = store.memberships.get(membershipKey);
      if (membership === undefined || !membership.isActive || membership.role !== expectedRole)
        return false;
      store.memberships.set(membershipKey, { ...membership, role });
      return true;
    },

    reactivateMembership: async (workspaceId, actorId) => {
      const membershipKey = key(workspaceId, actorId);
      const membership = store.memberships.get(membershipKey);
      if (membership === undefined || membership.isActive) return false;
      store.memberships.set(membershipKey, { ...membership, isActive: true });
      return true;
    },
  },
  actors: {
    findBySupabaseUserId: async (supabaseUserId) => {
      const actorId = store.actorsBySubject.get(supabaseUserId);
      return actorId === undefined ? null : { actorId };
    },

    findById: async (actorId) => {
      const displayName = store.actorNames.get(actorId);
      return displayName === undefined ? null : { actorId, displayName };
    },

    listActiveWorkspaces: async (actorId) =>
      [...store.memberships.values()]
        .filter((membership) => membership.actorId === actorId && membership.isActive)
        .flatMap((membership) => {
          const workspaceName = store.workspaceNames.get(membership.workspaceId);
          // Inner join, as in the SQL: an unnamed workspace is not a door.
          return workspaceName === undefined
            ? []
            : [
                {
                  workspaceId: membership.workspaceId,
                  workspaceName,
                  role: membership.role,
                },
              ];
        })
        .sort((a, b) =>
          a.workspaceName === b.workspaceName
            ? a.workspaceId.localeCompare(b.workspaceId)
            : a.workspaceName.localeCompare(b.workspaceName),
        ),
  },
});
