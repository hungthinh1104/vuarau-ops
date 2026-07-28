import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  activeCustomer,
  LATEST_RECORDED_AT,
  LATEST_TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import {
  commandIdSchema,
  customerAccountEntryIdSchema,
  customerIdSchema,
  moneySchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
  validateWorkspaceBackup,
} from "./operations.queries.ts";
import { restoreWorkspaceBackup } from "./restore-workspace.handler.ts";

let harness: Harness;
beforeEach(() => {
  harness = createHarness();
});
const exportInput = () => ({
  commandId: "00000000-0000-4000-8000-000000000790",
  idempotencyKey: "export-backup-key-0001",
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATEST_TRANSACTION_TIME,
  payload: {},
});

describe("M14 logical operations evidence", () => {
  it("exports a deterministic canonical payload with no secret material", async () => {
    const first = await exportWorkspaceBackup(harness.ctx, exportInput());
    const second = await exportWorkspaceBackup(harness.ctx, exportInput());
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.value.digest).toBe(second.value.digest);
    expect(first.value.digest).toBe(backupDigest(first.value.payload));
    expect(JSON.stringify(first.value)).not.toMatch(/SUPABASE|bearer|password|jwt/i);
  });

  it("does not recursively embed an earlier backup command receipt", async () => {
    const first = await exportWorkspaceBackup(harness.ctx, exportInput());
    expect(first.ok).toBe(true);
    const second = await exportWorkspaceBackup(harness.ctx, {
      ...exportInput(),
      commandId: "00000000-0000-4000-8000-000000000794",
      idempotencyKey: "export-backup-key-0002",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.payload.commandReceipts).not.toContainEqual(
      expect.objectContaining({ commandType: "ExportWorkspaceBackup" }),
    );
    expect(JSON.stringify(second.value.payload.commandReceipts)).not.toContain(
      "vuarau.workspace-backup",
    );
  });

  it("rejects a changed payload during validation and reports workspace integrity", async () => {
    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    if (!exported.ok) return;
    const changed = {
      ...exported.value,
      payload: { ...exported.value.payload, customers: [{ injected: true }] },
    };
    const validation = await validateWorkspaceBackup(harness.ctx, WORKSPACE_ID, changed);
    expect(validation.ok && validation.value.valid).toBe(false);
    expect(validation.ok && validation.value.diagnostics).toContain("bad_digest");

    const integrity = await getWorkspaceIntegrity(harness.ctx, WORKSPACE_ID);
    expect(integrity.ok && integrity.value.status).toBe("healthy");
  });

  it("restores atomically into an empty target and replays the same command without duplicates", async () => {
    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    if (!exported.ok) return;
    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000799");
    harness.db.registerWorkspace(target, "Vựa phục hồi");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const command = {
      commandId: "00000000-0000-4000-8000-000000000798",
      idempotencyKey: "restore-backup-key-0001",
      workspaceId: target,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
      payload: { backup: exported.value, reason: "Kiểm tra phục hồi định kỳ" },
    };
    const first = await restoreWorkspaceBackup(harness.ctx, command);
    const replay = await restoreWorkspaceBackup(harness.ctx, command);
    expect(first.ok, JSON.stringify(first)).toBe(true);
    expect(replay).toEqual(first);
    const restoredCustomerId = customerIdSchema.parse(exported.value.payload.customers[0]?.["id"]);
    expect(harness.db.balanceFor(target, restoredCustomerId)).toBeDefined();
  });

  it("reports a ledger entry whose canonical source is missing", async () => {
    harness.db.seedAccountEntry({
      id: customerAccountEntryIdSchema.parse("00000000-0000-4000-8000-000000000791"),
      workspaceId: WORKSPACE_ID,
      customerId: activeCustomer.id,
      amount: moneySchema.parse({ amountMinor: 25_000, currency: "VND" }),
      sourceType: "sale_posting",
      sourceId: "00000000-0000-4000-8000-000000000792",
      reversalOfEntryId: null,
      reasonCode: null,
      reason: null,
      transactionTime: LATEST_TRANSACTION_TIME,
      recordedAt: LATEST_RECORDED_AT,
      actorId: ACTOR_ID,
      commandId: commandIdSchema.parse("00000000-0000-4000-8000-000000000793"),
    });

    const integrity = await getWorkspaceIntegrity(harness.ctx, WORKSPACE_ID);
    expect(integrity.ok && integrity.value).toMatchObject({
      status: "attention",
      anomalousCustomers: 1,
      missingSources: 1,
      projectionDrift: 1,
    });
  });
});
