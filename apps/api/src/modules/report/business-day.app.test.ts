import { beforeEach, describe, expect, it } from "vitest";
import {
  commandIdSchema,
  customerAccountEntryIdSchema,
  defaultWorkspaceOperationalProfile,
} from "@vuarau/domain-contracts";
import { ACTOR_ID, WORKSPACE_ID, activeCustomer } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { getOperationalReport, getOperationalReportCsv } from "./report.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
  harness.db.setOperationalProfile({
    ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
    businessDayStartMinute: 22 * 60,
    version: 2,
  });
});

function seedAdjustment(id: string, transactionTime: string): void {
  harness.db.seedAccountEntry({
    id: customerAccountEntryIdSchema.parse(id),
    workspaceId: WORKSPACE_ID,
    customerId: activeCustomer.id,
    amount: { amountMinor: 1_000, currency: "VND" },
    sourceType: "manual_adjustment",
    sourceId: id,
    reversalOfEntryId: null,
    reasonCode: "opening_balance",
    reason: "Kiểm tra ranh giới ngày kinh doanh",
    transactionTime,
    recordedAt: "2026-07-31T00:00:00.000Z",
    actorId: ACTOR_ID,
    commandId: commandIdSchema.parse(crypto.randomUUID()),
  });
}

describe("operational report business-day policy", () => {
  it("groups by the workspace's configured start time, not calendar midnight", async () => {
    seedAdjustment("10000000-0000-4000-8000-000000000001", "2026-07-29T14:59:59.999Z");
    seedAdjustment("10000000-0000-4000-8000-000000000002", "2026-07-29T15:00:00.000Z");
    seedAdjustment("10000000-0000-4000-8000-000000000003", "2026-07-30T14:59:59.999Z");
    seedAdjustment("10000000-0000-4000-8000-000000000004", "2026-07-30T15:00:00.000Z");

    const result = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "customer_account_activity",
      businessDate: "2026-07-29",
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.page.items.map((row) => row.id).sort()).toEqual([
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
    ]);
    expect(result.value.totals.amount?.amountMinor).toBe(2_000);
  });

  it("fails closed for projection-backed reports when canonical integrity is in attention", async () => {
    harness.db.seedAccountEntry({
      id: customerAccountEntryIdSchema.parse("10000000-0000-4000-8000-000000000010"),
      workspaceId: WORKSPACE_ID,
      customerId: activeCustomer.id,
      amount: { amountMinor: 1_000, currency: "VND" },
      sourceType: "manual_adjustment",
      sourceId: "10000000-0000-4000-8000-000000000010",
      reversalOfEntryId: null,
      reasonCode: "opening_balance",
      reason: "Projection fail-closed regression",
      transactionTime: "2026-07-29T01:00:00.000Z",
      recordedAt: "2026-07-29T01:00:00.000Z",
      actorId: ACTOR_ID,
      commandId: commandIdSchema.parse("10000000-0000-4000-8000-000000000011"),
    });
    harness.db.overwriteBalance({
      workspaceId: WORKSPACE_ID,
      customerId: activeCustomer.id,
      balance: { amountMinor: 9_999, currency: "VND" },
      entryCount: 1,
      lastEntryTransactionTime: "2026-07-29T01:00:00.000Z",
      updatedAt: "2026-07-29T01:00:00.000Z",
    });

    const report = await getOperationalReport(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "customer_receivables",
      businessDate: null,
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(report.ok).toBe(true);
    if (!report.ok) return;
    expect(report.value).toMatchObject({
      integrity: "attention",
      diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
      totals: { amount: null, quantities: [] },
      page: { items: [], nextCursor: null },
    });

    const csv = await getOperationalReportCsv(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      reportType: "customer_receivables",
      businessDate: null,
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(csv.ok).toBe(true);
    if (csv.ok) expect(csv.value.split("\n")).toHaveLength(1);
  });
});
