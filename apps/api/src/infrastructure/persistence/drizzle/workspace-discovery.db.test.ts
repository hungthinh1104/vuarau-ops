import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDbTestContext, createUnitOfWork, hasDatabase, type DbTestContext } from "@vuarau/db";
import { permissionsForRole } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { listActorWorkspaces } from "../../../modules/session/session.queries.ts";
import { revokeWorkspaceMembership } from "../../../modules/session/revoke-membership.handler.ts";

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
describe.skipIf(!hasDatabase)("workspace discovery against Postgres", () => {
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
