import { beforeEach, describe, expect, it } from "vitest";
import type {
  CostObservationId,
  DebtObservationId,
  ReconciliationObservationId,
  SupplyCommitmentObservationId,
  SupplierObservationId,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  FOREIGN_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  getCostObservation,
  listCostObservations,
  getReconciliationObservation,
  listReconciliationObservations,
  getDebtObservation,
  listDebtObservations,
  getSupplierObservation,
  listSupplierObservations,
} from "./evidence.queries.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
  recordDebtObservation,
  recordSupplyCommitmentObservation,
  recordSupplierObservation,
} from "./evidence.handlers.ts";
import {
  getSupplyCommitmentObservation,
  listSupplyCommitmentObservations,
} from "./evidence.queries.ts";

let harness: Harness;
let sequence = 0;

const uuid = <T extends string>(): T => crypto.randomUUID() as T;

const input = (overrides: Record<string, unknown> = {}) => ({
  commandId: uuid(),
  idempotencyKey: `cost-observation-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    costObservationId: uuid<CostObservationId>(),
    kind: "spoilage",
    caseKind: "normal",
    description: "Một sọt bị dập sau khi vận chuyển.",
    participantWording: "Chị nói sọt này đã bị dập từ lúc xuống xe.",
    facts: {
      amount: { amountMinor: 125_000, currency: "VND" },
      quantity: { valueScaled: 2_500, unit: "kg" },
      productId: null,
      qualityGradeId: null,
      sourceReference: "note://receiving/001",
    },
    evidenceReferences: ["photo://receiving/001"],
    relatedObservationId: null,
  },
  ...overrides,
});

const reconciliationInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: uuid(),
  idempotencyKey: `reconciliation-observation-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    reconciliationObservationId: uuid<ReconciliationObservationId>(),
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
      scopeReference: "stocktake://application-001",
    },
    evidenceReferences: ["photo://stocktake/application-001"],
    relatedObservationId: null,
  },
  ...overrides,
});

const debtInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: uuid(),
  idempotencyKey: `debt-observation-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    debtObservationId: uuid<DebtObservationId>(),
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
    evidenceReferences: ["note://debt/001"],
    relatedObservationId: null,
  },
  ...overrides,
});

const supplyCommitmentInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: uuid(),
  idempotencyKey: `supply-commitment-observation-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    supplyCommitmentObservationId: uuid<SupplyCommitmentObservationId>(),
    kind: "promised_supply",
    caseKind: "normal",
    description: "Đầu mối báo có thể giao rau vào sáng mai.",
    participantWording: "Mai có khoảng hai tạ, nếu xe về đúng giờ.",
    facts: {
      supplierId: null,
      productId: null,
      qualityGradeId: null,
      promisedQuantity: { valueScaled: 200_000, unit: "kg" },
      minimumOrder: { valueScaled: 50_000, unit: "kg" },
      expectedArrivalAt: "2026-08-04T02:00:00.000Z",
      counterpartyLabel: "Anh Tư đầu mối chợ sớm",
      commitmentReference: "message://supply/001",
    },
    evidenceReferences: ["voice://supply/001"],
    relatedObservationId: null,
  },
  ...overrides,
});

const supplierObservationInput = (overrides: Record<string, unknown> = {}) => ({
  commandId: uuid(),
  idempotencyKey: `supplier-observation-${++sequence}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
  payload: {
    supplierObservationId: uuid<SupplierObservationId>(),
    kind: "role",
    caseKind: "normal",
    description: "Nhà cung cấp tự giao hàng từ vùng sản xuất.",
    participantWording: "Bên tôi đóng gói rồi đưa lên xe.",
    facts: {
      supplierId: null,
      productId: null,
      qualityGradeId: null,
      role: "hợp tác xã",
      sourceArea: "Đức Trọng",
      pickupResponsibility: "nhà cung cấp",
      packingResponsibility: "nhà cung cấp",
      transportResponsibility: "nhà cung cấp",
      expectedLeadTimeText: "mỗi ngày",
      paymentArrangement: "trao đổi, chưa chốt quy tắc hệ thống",
      traceabilityLevel: "phiếu lô giấy",
      promisedQuantity: { valueScaled: 200_000, unit: "kg" },
      actualQuantity: { valueScaled: 190_000, unit: "kg" },
      acceptedQuantity: null,
      rejectedQuantity: null,
      expectedAt: "2026-08-04T02:00:00.000Z",
      actualAt: "2026-08-04T03:00:00.000Z",
      price: null,
      claimReference: null,
      observationReference: "note://supplier/001",
    },
    evidenceReferences: ["photo://supplier/001"],
    relatedObservationId: null,
  },
  ...overrides,
});

beforeEach(() => {
  sequence = 0;
  harness = createHarness();
});

describe("cost observation application", () => {
  it("TC-EVIDENCE-018 — records and reads source-linked facts without canonical effects", async () => {
    const recorded = await recordCostObservation(harness.ctx, input());

    expect(recorded.ok).toBe(true);
    if (!recorded.ok) return;
    expect(recorded.value.facts.amount?.amountMinor).toBe(125_000);
    expect(recorded.value.evidenceReferences).toEqual(["photo://receiving/001"]);

    const listed = await listCostObservations(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      kind: null,
      cursor: null,
      limit: 50,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.items).toEqual([recorded.value]);

    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(0);
    expect(harness.db.cashMovementRecords()).toHaveLength(0);
  });

  it("TC-EVIDENCE-019 — retries return the original result and do not append another fact", async () => {
    const command = input();
    const first = await recordCostObservation(harness.ctx, command);
    const retry = await recordCostObservation(harness.ctx, command);

    expect(retry).toEqual(first);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("TC-EVIDENCE-020 — correction links only to a source in the same workspace", async () => {
    const first = await recordCostObservation(harness.ctx, input());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const correction = await recordCostObservation(
      harness.ctx,
      input({
        payload: {
          ...input().payload,
          costObservationId: uuid<CostObservationId>(),
          caseKind: "correction",
          relatedObservationId: first.value.id,
        },
      }),
    );
    expect(correction.ok).toBe(true);
    if (correction.ok) expect(correction.value.relatedObservationId).toBe(first.value.id);

    const foreignRead = await getCostObservation(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      costObservationId: first.value.id,
    });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok) expect(foreignRead.error.code).toBe("COST_OBSERVATION_NOT_FOUND");
  });

  it("TC-EVIDENCE-021 — refuses a command that tries to cross the workspace boundary", async () => {
    const result = await recordCostObservation(
      harness.contextFor(FOREIGN_ACTOR_ID),
      input({
        actorId: FOREIGN_ACTOR_ID,
        workspaceId: WORKSPACE_ID,
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("WORKSPACE_ACCESS_DENIED");
    expect(harness.db.auditRecords()).toHaveLength(0);
  });
});

describe("reconciliation observation application", () => {
  it("TC-EVIDENCE-030 — records, lists and retries raw facts without canonical effects", async () => {
    const command = reconciliationInput();
    const recorded = await recordReconciliationObservation(harness.ctx, command);
    const retry = await recordReconciliationObservation(harness.ctx, command);

    expect(recorded.ok).toBe(true);
    expect(retry).toEqual(recorded);
    if (!recorded.ok) return;
    expect(recorded.value.facts.expectedQuantity).toEqual({ valueScaled: 10_000, unit: "kg" });
    expect(recorded.value.facts.observedQuantity).toEqual({ valueScaled: 9_500, unit: "kg" });
    expect(recorded.value).not.toHaveProperty("variance");

    const listed = await listReconciliationObservations(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      kind: "inventory_count",
      cursor: null,
      limit: 50,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.items).toEqual([recorded.value]);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(0);
    expect(harness.db.cashMovementRecords()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("TC-EVIDENCE-031 — keeps corrections in the same workspace", async () => {
    const first = await recordReconciliationObservation(harness.ctx, reconciliationInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const correction = await recordReconciliationObservation(
      harness.ctx,
      reconciliationInput({
        payload: {
          ...reconciliationInput().payload,
          reconciliationObservationId: uuid<ReconciliationObservationId>(),
          caseKind: "correction",
          relatedObservationId: first.value.id,
        },
      }),
    );
    expect(correction.ok).toBe(true);

    const foreignRead = await getReconciliationObservation(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      reconciliationObservationId: first.value.id,
    });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok)
      expect(foreignRead.error.code).toBe("RECONCILIATION_OBSERVATION_NOT_FOUND");
  });
});

describe("supply commitment observation application", () => {
  it("TC-EVIDENCE-050 — captures source-linked supply facts without payable or inventory effects", async () => {
    const command = supplyCommitmentInput();
    const recorded = await recordSupplyCommitmentObservation(harness.ctx, command);
    const retry = await recordSupplyCommitmentObservation(harness.ctx, command);

    expect(recorded.ok).toBe(true);
    expect(retry).toEqual(recorded);
    if (!recorded.ok) return;
    expect(recorded.value.facts.promisedQuantity).toEqual({ valueScaled: 200_000, unit: "kg" });
    expect(recorded.value.facts.counterpartyLabel).toBe("Anh Tư đầu mối chợ sớm");

    const listed = await listSupplyCommitmentObservations(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      kind: null,
      cursor: null,
      limit: 50,
    });
    expect(listed.ok && listed.value.items).toEqual([recorded.value]);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("TC-EVIDENCE-051 — correction target and reads remain workspace-scoped", async () => {
    const first = await recordSupplyCommitmentObservation(harness.ctx, supplyCommitmentInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const correction = await recordSupplyCommitmentObservation(
      harness.ctx,
      supplyCommitmentInput({
        payload: {
          ...supplyCommitmentInput().payload,
          supplyCommitmentObservationId: uuid<SupplyCommitmentObservationId>(),
          caseKind: "correction",
          relatedObservationId: first.value.id,
        },
      }),
    );
    expect(correction.ok).toBe(true);
    const foreign = await getSupplyCommitmentObservation(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      supplyCommitmentObservationId: first.value.id,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND");
  });
});

describe("debt observation application", () => {
  it("TC-EVIDENCE-035 — records, lists and retries term evidence without debt effects", async () => {
    const command = debtInput();
    const recorded = await recordDebtObservation(harness.ctx, command);
    const retry = await recordDebtObservation(harness.ctx, command);

    expect(recorded.ok).toBe(true);
    expect(retry).toEqual(recorded);
    if (!recorded.ok) return;
    expect(recorded.value.facts.agreedDueAt).toBe("2026-08-07T17:00:00.000Z");
    expect(recorded.value).not.toHaveProperty("overdue");
    expect(recorded.value).not.toHaveProperty("allocation");

    const listed = await listDebtObservations(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      kind: "agreed_due_date",
      cursor: null,
      limit: 50,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.items).toEqual([recorded.value]);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("TC-EVIDENCE-036 — correction and reads remain workspace scoped", async () => {
    const first = await recordDebtObservation(harness.ctx, debtInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const correction = await recordDebtObservation(
      harness.ctx,
      debtInput({
        payload: {
          ...debtInput().payload,
          debtObservationId: uuid<DebtObservationId>(),
          caseKind: "correction",
          relatedObservationId: first.value.id,
        },
      }),
    );
    expect(correction.ok).toBe(true);
    const foreignRead = await getDebtObservation(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      debtObservationId: first.value.id,
    });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok) expect(foreignRead.error.code).toBe("DEBT_OBSERVATION_NOT_FOUND");
  });
});

describe("supplier observation application", () => {
  it("TC-EVIDENCE-060 — records raw relationship/performance facts without score or canonical effects", async () => {
    const command = supplierObservationInput();
    const recorded = await recordSupplierObservation(harness.ctx, command);
    const retry = await recordSupplierObservation(harness.ctx, command);

    expect(recorded.ok).toBe(true);
    expect(retry).toEqual(recorded);
    if (!recorded.ok) return;
    expect(recorded.value.facts.sourceArea).toBe("Đức Trọng");
    expect(recorded.value.facts.promisedQuantity).toEqual({ valueScaled: 200_000, unit: "kg" });
    expect(recorded.value).not.toHaveProperty("score");
    const listed = await listSupplierObservations(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      kind: null,
      cursor: null,
      limit: 50,
    });
    expect(listed.ok && listed.value.items).toEqual([recorded.value]);
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.inventoryMovementRecords()).toHaveLength(0);
    expect(harness.db.auditRecords()).toHaveLength(1);
  });

  it("TC-EVIDENCE-061 — correction links and reads remain workspace scoped", async () => {
    const first = await recordSupplierObservation(harness.ctx, supplierObservationInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const correction = await recordSupplierObservation(
      harness.ctx,
      supplierObservationInput({
        payload: {
          ...supplierObservationInput().payload,
          supplierObservationId: uuid<SupplierObservationId>(),
          caseKind: "correction",
          relatedObservationId: first.value.id,
        },
      }),
    );
    expect(correction.ok).toBe(true);
    const foreign = await getSupplierObservation(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      supplierObservationId: first.value.id,
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe("SUPPLIER_OBSERVATION_NOT_FOUND");
  });
});
