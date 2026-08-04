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
  SupplyCommitmentObservationId,
  SupplierObservationId,
  DemandObservationId,
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
  getSupplyCommitmentObservation,
  listSupplyCommitmentObservations,
  getSupplierObservation,
  listSupplierObservations,
  getDemandObservation,
  listDemandObservations,
} from "../../../modules/evidence/evidence.queries.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
  recordDebtObservation,
  recordSupplyCommitmentObservation,
  recordSupplierObservation,
  recordDemandObservation,
} from "../../../modules/evidence/evidence.handlers.ts";

describe.skipIf(skipWithoutDatabase())("cost observations against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let observationId: CostObservationId;
  let reconciliationObservationId: ReconciliationObservationId;
  let debtObservationId: DebtObservationId;
  let supplyCommitmentObservationId: SupplyCommitmentObservationId;
  let supplierObservationId: SupplierObservationId;
  let demandObservationId: DemandObservationId;

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
    supplyCommitmentObservationId = crypto.randomUUID() as SupplyCommitmentObservationId;
    supplierObservationId = crypto.randomUUID() as SupplierObservationId;
    demandObservationId = crypto.randomUUID() as DemandObservationId;

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
    const supplyCommitment = await recordSupplyCommitmentObservation(context(), {
      ...envelope("supply-commitment-record"),
      payload: {
        supplyCommitmentObservationId,
        kind: "promised_supply",
        caseKind: "normal",
        description: "Đầu mối báo có thể giao hàng vào sáng mai.",
        participantWording: "Mai có thể giao khoảng hai tạ nếu xe về đúng giờ.",
        facts: {
          supplierId: null,
          productId: null,
          qualityGradeId: null,
          promisedQuantity: { valueScaled: 200_000, unit: "kg" },
          minimumOrder: null,
          expectedArrivalAt: "2026-08-04T02:00:00.000Z",
          counterpartyLabel: "Đầu mối chợ sớm",
          commitmentReference: "message://supply/db-001",
        },
        evidenceReferences: ["voice://supply/db-001"],
        relatedObservationId: null,
      },
    });
    expect(supplyCommitment.ok).toBe(true);
    const supplier = await recordSupplierObservation(context(), {
      ...envelope("supplier-observation-record"),
      payload: {
        supplierObservationId,
        kind: "role",
        caseKind: "normal",
        description: "Nhà cung cấp tự giao hàng từ vùng sản xuất.",
        participantWording: "Bên tôi đóng gói rồi đưa lên xe.",
        facts: {
          supplierId: null,
          productId: null,
          qualityGradeId: null,
          supplierObservationGroupId: null,
          role: "hợp tác xã",
          sourceArea: "Đức Trọng",
          pickupResponsibility: "nhà cung cấp",
          packingResponsibility: "nhà cung cấp",
          transportResponsibility: "nhà cung cấp",
          expectedLeadTimeText: "mỗi ngày",
          paymentArrangement: "trao đổi",
          traceabilityLevel: "phiếu lô giấy",
          promisedQuantity: { valueScaled: 200_000, unit: "kg" },
          actualQuantity: { valueScaled: 190_000, unit: "kg" },
          acceptedQuantity: null,
          rejectedQuantity: null,
          expectedAt: "2026-08-04T02:00:00.000Z",
          actualAt: "2026-08-04T03:00:00.000Z",
          price: null,
          claimReference: null,
          observationReference: "note://supplier/db-001",
        },
        evidenceReferences: ["photo://supplier/db-001"],
        relatedObservationId: null,
      },
    });
    expect(supplier.ok).toBe(true);
    const demand = await recordDemandObservation(context(), {
      ...envelope("demand-observation-record"),
      payload: {
        demandObservationId,
        kind: "requested_order",
        caseKind: "normal",
        description: "Khách hỏi đặt rau cho chuyến giao cuối tuần.",
        participantWording: "Thứ bảy cần khoảng ba mươi ký, chưa chốt đơn.",
        facts: {
          customerId: null,
          productId: null,
          qualityGradeId: null,
          requestedQuantity: { valueScaled: 30_000, unit: "kg" },
          minimumQuantity: null,
          requestedForAt: "2026-08-08T02:00:00.000Z",
          counterpartyLabel: "Quán ăn đầu mối",
          demandReference: "message://demand/db-001",
        },
        evidenceReferences: ["voice://demand/db-001"],
        relatedObservationId: null,
      },
    });
    expect(demand.ok).toBe(true);
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
    expect(backup.value.version).toBe(19);
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
    expect(backup.value.payload.supplyCommitmentObservations).toContainEqual(
      expect.objectContaining({
        id: supplyCommitmentObservationId,
        evidenceReferences: ["voice://supply/db-001"],
      }),
    );
    expect(backup.value.payload.supplierObservations).toContainEqual(
      expect.objectContaining({
        id: supplierObservationId,
        evidenceReferences: ["photo://supplier/db-001"],
      }),
    );
    expect(backup.value.payload.demandObservations).toContainEqual(
      expect.objectContaining({
        id: demandObservationId,
        evidenceReferences: ["voice://demand/db-001"],
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

  it("TC-EVIDENCE-052 — reads supply commitments without deriving payable or inventory", async () => {
    const found = await getSupplyCommitmentObservation(context(), {
      workspaceId: ctx.workspaceId,
      supplyCommitmentObservationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.facts).toEqual({
      supplierId: null,
      productId: null,
      qualityGradeId: null,
      promisedQuantity: { valueScaled: 200_000, unit: "kg" },
      minimumOrder: null,
      expectedArrivalAt: "2026-08-04T02:00:00.000Z",
      counterpartyLabel: "Đầu mối chợ sớm",
      commitmentReference: "message://supply/db-001",
    });
    const page = await listSupplyCommitmentObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "promised_supply",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok)
      expect(page.value.items.map((item) => item.id)).toContain(supplyCommitmentObservationId);
  });

  it("TC-EVIDENCE-062 — reads supplier relationship facts without deriving score or payable", async () => {
    const found = await getSupplierObservation(context(), {
      workspaceId: ctx.workspaceId,
      supplierObservationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.facts).toMatchObject({
      role: "hợp tác xã",
      sourceArea: "Đức Trọng",
      promisedQuantity: { valueScaled: 200_000, unit: "kg" },
      actualQuantity: { valueScaled: 190_000, unit: "kg" },
    });
    expect(found.value).not.toHaveProperty("score");
    const page = await listSupplierObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "role",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.value.items.map((item) => item.id)).toContain(supplierObservationId);
  });

  it("TC-EVIDENCE-066 — reads demand facts without deriving forecast or reorder risk", async () => {
    const found = await getDemandObservation(context(), {
      workspaceId: ctx.workspaceId,
      demandObservationId,
    });
    expect(found.ok).toBe(true);
    if (!found.ok) return;
    expect(found.value.facts).toMatchObject({
      requestedQuantity: { valueScaled: 30_000, unit: "kg" },
      requestedForAt: "2026-08-08T02:00:00.000Z",
      demandReference: "message://demand/db-001",
    });
    expect(found.value).not.toHaveProperty("forecast");
    const page = await listDemandObservations(context(), {
      workspaceId: ctx.workspaceId,
      kind: "requested_order",
      cursor: null,
      limit: 50,
    });
    expect(page.ok).toBe(true);
    if (page.ok) expect(page.value.items.map((item) => item.id)).toContain(demandObservationId);
  });

  it("TC-EVIDENCE-069 — PostgreSQL rejects supplier correction identity changes and forks", async () => {
    const supplierFacts = {
      supplierId: null,
      productId: null,
      qualityGradeId: null,
      role: "hợp tác xã",
      sourceArea: "Đức Trọng",
      pickupResponsibility: "nhà cung cấp",
      packingResponsibility: "nhà cung cấp",
      transportResponsibility: "nhà cung cấp",
      expectedLeadTimeText: "mỗi ngày",
      paymentArrangement: "trao đổi",
      traceabilityLevel: "phiếu lô giấy",
      promisedQuantity: { valueScaled: 200_000, unit: "kg" },
      actualQuantity: { valueScaled: 190_000, unit: "kg" },
      acceptedQuantity: null,
      rejectedQuantity: null,
      expectedAt: "2026-08-04T02:00:00.000Z",
      actualAt: "2026-08-04T03:00:00.000Z",
      price: null,
      claimReference: null,
      observationReference: "note://supplier/db-001",
    };
    const mismatch = await recordSupplierObservation(context(), {
      ...envelope("supplier-observation-mismatch"),
      payload: {
        supplierObservationId: crypto.randomUUID() as SupplierObservationId,
        kind: "actual_quantity",
        caseKind: "correction",
        description: "Đổi nhầm loại quan sát.",
        participantWording: "Không cùng identity.",
        facts: supplierFacts,
        evidenceReferences: ["photo://supplier/db-mismatch"],
        relatedObservationId: supplierObservationId,
      },
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) {
      expect(mismatch.error.code).toBe("SUPPLIER_OBSERVATION_CORRECTION_IDENTITY_MISMATCH");
    }

    const correctionId = crypto.randomUUID() as SupplierObservationId;
    const correction = await recordSupplierObservation(context(), {
      ...envelope("supplier-observation-correction"),
      payload: {
        supplierObservationId: correctionId,
        kind: "role",
        caseKind: "correction",
        description: "Sửa lại diễn giải nguồn.",
        participantWording: "Giữ nguyên identity của observation.",
        facts: supplierFacts,
        evidenceReferences: ["photo://supplier/db-correction"],
        relatedObservationId: supplierObservationId,
      },
    });
    expect(correction.ok).toBe(true);

    const fork = await recordSupplierObservation(context(), {
      ...envelope("supplier-observation-fork"),
      payload: {
        supplierObservationId: crypto.randomUUID() as SupplierObservationId,
        kind: "role",
        caseKind: "correction",
        description: "Fork không hợp lệ.",
        participantWording: "Cùng target đã có correction.",
        facts: supplierFacts,
        evidenceReferences: ["photo://supplier/db-fork"],
        relatedObservationId: supplierObservationId,
      },
    });
    expect(fork.ok).toBe(false);
    if (!fork.ok) {
      expect(fork.error.code).toBe("SUPPLIER_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED");
    }
  });
});
