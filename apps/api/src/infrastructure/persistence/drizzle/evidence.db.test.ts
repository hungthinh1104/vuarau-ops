import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  CostObservationId,
  DebtObservationId,
  ReconciliationObservationId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { exportWorkspaceBackup } from "../../../modules/operations/operations.queries.ts";
import {
  getCostObservation,
  listCostObservations,
  getReconciliationObservation,
  listReconciliationObservations,
  getDebtObservation,
  listDebtObservations,
} from "../../../modules/evidence/evidence.queries.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
  recordDebtObservation,
} from "../../../modules/evidence/evidence.handlers.ts";

describe.skipIf(skipWithoutDatabase())("cost observations against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let observationId: CostObservationId;
  let reconciliationObservationId: ReconciliationObservationId;
  let debtObservationId: DebtObservationId;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });

  const envelope = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-08-02T01:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`cost-observation-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-03T01:00:00.000Z" as never },
    };
    observationId = crypto.randomUUID() as CostObservationId;
    reconciliationObservationId = crypto.randomUUID() as ReconciliationObservationId;
    debtObservationId = crypto.randomUUID() as DebtObservationId;

    const result = await recordCostObservation(context(), {
      ...envelope("record"),
      payload: {
        costObservationId: observationId,
        kind: "spoilage",
        caseKind: "normal",
        description: "Một sọt bị dập sau khi vận chuyển.",
        participantWording: "Chị nói sọt này đã bị dập từ lúc xuống xe.",
        facts: {
          amount: { amountMinor: 125_000, currency: "VND" },
          quantity: { valueScaled: 2_500, unit: "kg" },
          productId: null,
          qualityGradeId: null,
          sourceReference: "note://receiving/db-001",
        },
        evidenceReferences: ["photo://receiving/db-001"],
        relatedObservationId: null,
      },
    });
    expect(result.ok).toBe(true);
    const reconciliation = await recordReconciliationObservation(context(), {
      ...envelope("reconciliation-record"),
      payload: {
        reconciliationObservationId,
        kind: "inventory_count",
        caseKind: "normal",
        description: "Đếm thực tế tại khu sơ chế.",
        participantWording: "Phiếu đếm cuối ca ghi nhận số lượng quan sát được.",
        facts: {
          expectedAmount: null,
          observedAmount: null,
          expectedQuantity: { valueScaled: 10_000, unit: "kg" },
          observedQuantity: { valueScaled: 9_500, unit: "kg" },
          itemCount: 3,
          productId: null,
          qualityGradeId: null,
          scopeReference: "stocktake://db-001",
        },
        evidenceReferences: ["photo://stocktake/db-001"],
        relatedObservationId: null,
      },
    });
    expect(reconciliation.ok).toBe(true);
    const debt = await recordDebtObservation(context(), {
      ...envelope("debt-record"),
      payload: {
        debtObservationId,
        kind: "agreed_due_date",
        caseKind: "normal",
        description: "Khách hẹn thanh toán sau chuyến giao.",
        participantWording: "Chiều thứ sáu tôi chuyển khoản.",
        facts: {
          amount: { amountMinor: 250_000, currency: "VND" },
          agreedDueAt: "2026-08-07T17:00:00.000Z",
          promiseToPayAt: null,
          termCode: "FRIDAY",
          termText: "Thanh toán cuối tuần",
          paymentReference: null,
          allocationProposal: null,
          customerId: null,
        },
        evidenceReferences: ["note://debt/db-001"],
        relatedObservationId: null,
      },
    });
    expect(debt.ok).toBe(true);
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-EVIDENCE-023 — preserves source facts through the Drizzle write and read ports", async () => {
    const found = await getCostObservation(context(), {
      workspaceId: ctx.workspaceId,
      costObservationId: observationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value).toMatchObject({
      id: observationId,
      workspaceId: ctx.workspaceId,
      kind: "spoilage",
      facts: {
        amount: { amountMinor: 125_000, currency: "VND" },
        quantity: { valueScaled: 2_500, unit: "kg" },
        sourceReference: "note://receiving/db-001",
      },
      evidenceReferences: ["photo://receiving/db-001"],
    });

    const page = await listCostObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "spoilage",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.value.items.map((item) => item.id)).toContain(observationId);
  });

  it("TC-EVIDENCE-024 / TC-EVIDENCE-025 / TC-EVIDENCE-037 — includes evidence facts in the versioned backup", async () => {
    const backup = await exportWorkspaceBackup(context(), {
      ...envelope("backup"),
      payload: {},
    });
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    expect(backup.value.version).toBe(11);
    expect(backup.value.payload.costObservations).toContainEqual(
      expect.objectContaining({
        id: observationId,
        evidenceReferences: ["photo://receiving/db-001"],
      }),
    );
    expect(backup.value.payload.reconciliationObservations).toContainEqual(
      expect.objectContaining({
        id: reconciliationObservationId,
        evidenceReferences: ["photo://stocktake/db-001"],
      }),
    );
    expect(backup.value.payload.debtObservations).toContainEqual(
      expect.objectContaining({
        id: debtObservationId,
        evidenceReferences: ["note://debt/db-001"],
      }),
    );
  });

  it("TC-EVIDENCE-026 — reads reconciliation facts without calculating a variance", async () => {
    const found = await getReconciliationObservation(context(), {
      workspaceId: ctx.workspaceId,
      reconciliationObservationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.facts).toEqual({
      expectedAmount: null,
      observedAmount: null,
      expectedQuantity: { valueScaled: 10_000, unit: "kg" },
      observedQuantity: { valueScaled: 9_500, unit: "kg" },
      itemCount: 3,
      productId: null,
      qualityGradeId: null,
      scopeReference: "stocktake://db-001",
    });
    const page = await listReconciliationObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "inventory_count",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok)
      expect(page.value.items.map((item) => item.id)).toContain(reconciliationObservationId);
  });

  it("TC-EVIDENCE-038 — reads debt evidence without deriving overdue or allocation", async () => {
    const found = await getDebtObservation(context(), {
      workspaceId: ctx.workspaceId,
      debtObservationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.facts).toEqual({
      amount: { amountMinor: 250_000, currency: "VND" },
      agreedDueAt: "2026-08-07T17:00:00.000Z",
      promiseToPayAt: null,
      termCode: "FRIDAY",
      termText: "Thanh toán cuối tuần",
      paymentReference: null,
      allocationProposal: null,
      customerId: null,
    });
    expect(found.value).not.toHaveProperty("overdue");
    const page = await listDebtObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "agreed_due_date",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.value.items.map((item) => item.id)).toContain(debtObservationId);
  });
});
