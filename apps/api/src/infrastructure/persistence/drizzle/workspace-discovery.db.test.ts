import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import { permissionsForRole } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  getSession,
  getWorkspaceDetail,
  listActorWorkspaces,
} from "../../../modules/session/session.queries.ts";
import { revokeWorkspaceMembership } from "../../../modules/session/revoke-membership.handler.ts";
import {
  addWorkspaceMember,
  changeWorkspaceMemberRole,
  reactivateWorkspaceMember,
} from "../../../modules/session/manage-membership.handler.ts";

/**
 * BR-AUTH-008 / TC-AUTH-016 — workspace discovery against real Postgres.
 *
 * The application test proves the rule against the in-memory repository. This
 * proves the SQL: the `is_active` filter, the inner join onto `workspaces`, the
 * ordering, and — the one that matters — that the `actor_id` predicate is
 * actually in the query. A missing `WHERE actor_id = …` is a cross-tenant leak
 * that every in-memory test would still pass, because the in-memory filter is a
 * different piece of code.
 */
describe.skipIf(skipWithoutDatabase())("workspace discovery against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const contextFor = (actorId: DbTestContext["actorId"]): CommandContext => ({
    deps,
    principal: { actorId, subject: ctx.subjectOf(actorId) },
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("workspace-discovery");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("returns the depot the actor is a member of, with its name and permissions", async () => {
    const result = await listActorWorkspaces(contextFor(ctx.actorId));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.actorId).toBe(ctx.actorId);
    expect(result.value.workspaces).toEqual([
      {
        workspaceId: ctx.workspaceId,
        name: "test:workspace-discovery",
        role: "owner",
        permissions: [...permissionsForRole("owner")],
      },
    ]);
  });

  it("never returns a depot the actor is not a member of", async () => {
    // The seed puts a second workspace in the same database with a member of its
    // own. If the `actor_id` predicate were dropped, both rows would come back
    // here and the leak would be silent.
    const mine = await listActorWorkspaces(contextFor(ctx.actorId));
    const theirs = await listActorWorkspaces(contextFor(ctx.foreignActorId));

    expect(mine.ok && mine.value.workspaces.map((w) => w.workspaceId)).toEqual([ctx.workspaceId]);
    expect(theirs.ok && theirs.value.workspaces.map((w) => w.workspaceId)).toEqual([
      ctx.foreignWorkspaceId,
    ]);
  });

  it("shows nothing to an actor whose membership row is inactive", async () => {
    const result = await listActorWorkspaces(contextFor(ctx.revokedActorId));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workspaces).toEqual([]);
  });

  it("carries the role held in each depot, read from the row", async () => {
    const sales = await listActorWorkspaces(contextFor(ctx.roleActors.sales));

    expect(sales.ok).toBe(true);
    if (!sales.ok) return;
    expect(sales.value.workspaces[0]?.role).toBe("sales");
    expect(sales.value.workspaces[0]?.permissions).not.toContain("sale.void");
  });

  it("persists add, role change and reactivation with immediate authorization effect", async () => {
    const addCommand = {
      commandId: crypto.randomUUID(),
      idempotencyKey: `member-add-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString() as never,
      payload: {
        actorId: ctx.foreignActorId,
        role: "warehouse" as const,
        reason: "Hỗ trợ kho ở cả hai vựa",
      },
    };
    const added = await addWorkspaceMember(contextFor(ctx.actorId), addCommand);
    const replay = await addWorkspaceMember(contextFor(ctx.actorId), addCommand);
    expect(added.ok).toBe(true);
    expect(replay).toEqual(added);

    const changed = await changeWorkspaceMemberRole(contextFor(ctx.actorId), {
      commandId: crypto.randomUUID(),
      idempotencyKey: `member-role-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString() as never,
      payload: {
        actorId: ctx.roleActors.sales,
        expectedRole: "sales",
        role: "accountant",
        reason: "Phụ trách đối soát",
      },
    });
    expect(changed.ok).toBe(true);
    const changedSession = await getSession(contextFor(ctx.roleActors.sales), ctx.workspaceId);
    expect(changedSession.ok && changedSession.value.role).toBe("accountant");

    const activated = await reactivateWorkspaceMember(contextFor(ctx.actorId), {
      commandId: crypto.randomUUID(),
      idempotencyKey: `member-reactivate-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString() as never,
      payload: { actorId: ctx.revokedActorId, reason: "Trở lại làm việc" },
    });
    expect(activated.ok).toBe(true);

    const detail = await getWorkspaceDetail(contextFor(ctx.actorId), ctx.workspaceId);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(
      detail.value.members.filter((member) => member.actorId === ctx.foreignActorId),
    ).toHaveLength(1);
    expect(
      detail.value.members.find((member) => member.actorId === ctx.revokedActorId)?.isActive,
    ).toBe(true);
  });

  it("refuses a crafted self-role change in Postgres", async () => {
    const result = await changeWorkspaceMemberRole(contextFor(ctx.actorId), {
      commandId: crypto.randomUUID(),
      idempotencyKey: `member-self-role-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString() as never,
      payload: {
        actorId: ctx.actorId,
        expectedRole: "owner",
        role: "sales",
        reason: "Crafted request",
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("WORKSPACE_MEMBER_SELF_ROLE_CHANGE_DENIED");
  });

  it("drops a depot from the list as soon as the membership is revoked", async () => {
    // The end-to-end property revocation actually promises: it takes effect on
    // the next request, and the picker is a request like any other (BR-AUTH-003).
    const before = await listActorWorkspaces(contextFor(ctx.roleActors.delivery));
    expect(before.ok && before.value.workspaces).toHaveLength(1);

    const revoked = await revokeWorkspaceMembership(contextFor(ctx.actorId), {
      commandId: crypto.randomUUID(),
      idempotencyKey: `discovery-revoke-${crypto.randomUUID()}`,
      workspaceId: ctx.workspaceId,
      actorId: ctx.actorId,
      occurredAt: new Date().toISOString() as never,
      payload: { actorId: ctx.roleActors.delivery, reason: "Nghỉ việc" },
    });
    expect(revoked.ok).toBe(true);

    const after = await listActorWorkspaces(contextFor(ctx.roleActors.delivery));
    expect(after.ok && after.value.workspaces).toEqual([]);
  });
});
