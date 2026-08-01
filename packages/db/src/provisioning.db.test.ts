import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActorId, AuditRecordId, CommandId, WorkspaceId } from "@vuarau/domain-contracts";
import { createDatabase, type Database } from "./client.ts";
import { runMigrations } from "./migrate.ts";
import { bootstrapPilotWorkspace } from "./provisioning.ts";
import {
  actors,
  auditLogs,
  workspaceMembershipRoles,
  workspaces,
  workspaceMemberships,
} from "./schema/index.ts";
import { DATABASE_URL, skipWithoutDatabase } from "./testing/db-test-context.ts";

describe.skipIf(skipWithoutDatabase())("M23 — audited pilot bootstrap", () => {
  let database: Database;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    database = createDatabase(DATABASE_URL!, { max: 2 });
  });

  afterAll(async () => {
    await database.sql.end();
  });

  it("creates the first owner atomically and replays without duplicate audit", async () => {
    const workspaceId = crypto.randomUUID() as WorkspaceId;
    const actorId = crypto.randomUUID() as ActorId;
    const input = {
      workspaceId,
      workspaceName: "Vựa thật M23",
      actorId,
      supabaseUserId: `pilot-${crypto.randomUUID()}`,
      actorDisplayName: "Chủ vựa M23",
      commandId: crypto.randomUUID() as CommandId,
      auditRecordId: crypto.randomUUID() as AuditRecordId,
      occurredAt: new Date("2026-07-29T09:00:00.000Z"),
    };

    await expect(bootstrapPilotWorkspace(database, input)).resolves.toMatchObject({
      kind: "created",
      workspaceId,
      actorId,
    });
    await expect(bootstrapPilotWorkspace(database, input)).resolves.toMatchObject({
      kind: "replayed",
      workspaceId,
      actorId,
    });

    const [workspaceRows, actorRows, membershipRows, roleRows, auditRows] = await Promise.all([
      database.db.select().from(workspaces).where(eq(workspaces.id, workspaceId)),
      database.db.select().from(actors).where(eq(actors.id, actorId)),
      database.db
        .select()
        .from(workspaceMemberships)
        .where(eq(workspaceMemberships.workspaceId, workspaceId)),
      database.db
        .select()
        .from(workspaceMembershipRoles)
        .where(eq(workspaceMembershipRoles.workspaceId, workspaceId)),
      database.db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
    ]);
    expect(workspaceRows).toHaveLength(1);
    expect(actorRows).toHaveLength(1);
    expect(membershipRows).toMatchObject([{ actorId, role: "owner", isActive: true }]);
    expect(roleRows).toMatchObject([{ actorId, role: "owner", assignedBy: actorId }]);
    expect(auditRows).toMatchObject([
      {
        commandId: input.commandId,
        actorId,
        action: "membership.added",
        reason: "M23 pilot bootstrap",
      },
    ]);
  });

  it("rejects owner combined with another role at the database commit boundary", async () => {
    const workspaceId = crypto.randomUUID() as WorkspaceId;
    const actorId = crypto.randomUUID() as ActorId;
    const input = {
      workspaceId,
      workspaceName: "Vựa kiểm tra role set",
      actorId,
      supabaseUserId: `pilot-${crypto.randomUUID()}`,
      actorDisplayName: "Chủ vựa",
      commandId: crypto.randomUUID() as CommandId,
      auditRecordId: crypto.randomUUID() as AuditRecordId,
      occurredAt: new Date("2026-08-01T08:00:00.000Z"),
    };
    expect((await bootstrapPilotWorkspace(database, input)).kind).toBe("created");

    await expect(
      database.db.transaction(async (tx) => {
        await tx.insert(workspaceMembershipRoles).values({
          workspaceId,
          actorId,
          role: "sales",
          assignedBy: actorId,
        });
      }),
    ).rejects.toThrow(/owner role is exclusive/);

    expect(
      await database.db
        .select()
        .from(workspaceMembershipRoles)
        .where(eq(workspaceMembershipRoles.workspaceId, workspaceId)),
    ).toMatchObject([{ role: "owner" }]);
  });

  it("does not repurpose a non-empty workspace or a claimed Supabase subject", async () => {
    const workspaceId = crypto.randomUUID() as WorkspaceId;
    const firstActorId = crypto.randomUUID() as ActorId;
    const subject = `pilot-${crypto.randomUUID()}`;
    const base = {
      workspaceId,
      workspaceName: "Vựa không đổi quyền",
      actorId: firstActorId,
      supabaseUserId: subject,
      actorDisplayName: "Chủ vựa",
      commandId: crypto.randomUUID() as CommandId,
      auditRecordId: crypto.randomUUID() as AuditRecordId,
      occurredAt: new Date(),
    };
    expect((await bootstrapPilotWorkspace(database, base)).kind).toBe("created");

    const result = await bootstrapPilotWorkspace(database, {
      ...base,
      actorId: crypto.randomUUID() as ActorId,
      commandId: crypto.randomUUID() as CommandId,
      auditRecordId: crypto.randomUUID() as AuditRecordId,
    });
    expect(result).toMatchObject({ kind: "conflict" });
    expect(
      await database.db.select().from(auditLogs).where(eq(auditLogs.workspaceId, workspaceId)),
    ).toHaveLength(1);
  });
});
