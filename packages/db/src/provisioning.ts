import { and, asc, eq } from "drizzle-orm";
import type { ActorId, WorkspaceId, WorkspaceRole } from "@vuarau/domain-contracts";
import type { Database } from "./client.ts";
import { actors, workspaces, workspaceMemberships } from "./schema/index.ts";

/**
 * Creating a depot and putting somebody in it.
 *
 * There is no command for either, and that is deliberate rather than an omission:
 * a workspace is the tenant boundary, and a procedure that creates one would be a
 * procedure that provisions tenants over HTTP. Both of these need shell access to
 * the database, which is its own authorization boundary — the same reasoning the
 * balance rebuild tool is built on.
 *
 * They live here rather than in `apps/api` because `apps/api` may not import a
 * query builder (boundary-check), and there is no port for them: ports exist for
 * what the application layer needs at request time, and none of this happens at
 * request time.
 *
 * Every function is idempotent. An operator who reruns onboarding after fixing one
 * argument must not end up with two depots.
 */

export type ProvisionedWorkspace = {
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly created: boolean;
};

/** Creates the depot if the id is new, and reports which of the two happened. */
export async function ensureWorkspace(
  database: Database,
  workspaceId: WorkspaceId,
  name: string,
): Promise<ProvisionedWorkspace> {
  const existing = await database.db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);

  const found = existing[0];
  if (found !== undefined) {
    // The name is **not** overwritten. Renaming a live depot is a decision, not a
    // side effect of rerunning a script with a different argument.
    return { workspaceId, name: found.name, created: false };
  }

  await database.db.insert(workspaces).values({ id: workspaceId, name });
  return { workspaceId, name, created: true };
}

export async function listWorkspaces(
  database: Database,
): Promise<readonly { workspaceId: WorkspaceId; name: string }[]> {
  const rows = await database.db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .orderBy(asc(workspaces.name), asc(workspaces.id));
  return rows.map((row) => ({ workspaceId: row.id as WorkspaceId, name: row.name }));
}

export type ProvisionedMember = {
  readonly actorId: ActorId;
  readonly role: WorkspaceRole;
  readonly actorCreated: boolean;
  readonly membershipCreated: boolean;
  readonly reactivated: boolean;
};

/**
 * Links a Supabase subject to a local actor and gives it a role in one depot.
 *
 * `supabaseUserId` is the subject of the token the person will sign in with
 * (BR-AUTH-005). Without it the actor exists and cannot authenticate, which is a
 * legitimate state for an importer but useless for a pilot participant.
 *
 * An existing membership has its role **updated** and is reactivated if it was
 * revoked, because "run onboarding again with the right role" is the whole point
 * of an onboarding tool. That is a real privilege change, so the caller is told
 * exactly what happened and prints it.
 */
export async function ensureMembership(
  database: Database,
  input: {
    readonly workspaceId: WorkspaceId;
    readonly actorId: ActorId;
    readonly supabaseUserId: string;
    readonly displayName: string;
    readonly role: WorkspaceRole;
  },
): Promise<ProvisionedMember> {
  const existingActor = await database.db
    .select({ id: actors.id })
    .from(actors)
    .where(eq(actors.supabaseUserId, input.supabaseUserId))
    .limit(1);

  const actorId = (existingActor[0]?.id as ActorId | undefined) ?? input.actorId;
  const actorCreated = existingActor[0] === undefined;

  if (actorCreated) {
    await database.db.insert(actors).values({
      id: actorId,
      supabaseUserId: input.supabaseUserId,
      displayName: input.displayName,
    });
  }

  // Scoped to **this** depot. An actor may be a member of several, and a filter
  // on `actorId` alone would change their role in every one of them.
  const membershipScope = and(
    eq(workspaceMemberships.workspaceId, input.workspaceId),
    eq(workspaceMemberships.actorId, actorId),
  );

  const existingMembership = await database.db
    .select({ role: workspaceMemberships.role, isActive: workspaceMemberships.isActive })
    .from(workspaceMemberships)
    .where(membershipScope)
    .limit(1);

  const membership = existingMembership[0];
  if (membership === undefined) {
    await database.db.insert(workspaceMemberships).values({
      workspaceId: input.workspaceId,
      actorId,
      role: input.role,
      isActive: true,
    });
    return { actorId, role: input.role, actorCreated, membershipCreated: true, reactivated: false };
  }

  await database.db
    .update(workspaceMemberships)
    .set({ role: input.role, isActive: true })
    .where(membershipScope);

  return {
    actorId,
    role: input.role,
    actorCreated,
    membershipCreated: false,
    reactivated: !membership.isActive,
  };
}
