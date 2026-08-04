import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  activeCustomer,
  LATEST_RECORDED_AT,
  LATEST_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import {
  commandIdSchema,
  cashAccountIdSchema,
  defaultWorkspaceOperationalProfile,
  customerAccountEntryIdSchema,
  customerIdSchema,
  moneySchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import type {
  GoodsArrivalId,
  GoodsArrivalLineId,
  PurchaseId,
  PurchaseLineId,
  QualityDispositionAllocationId,
  QualityDispositionId,
  QualityInspectionId,
  SupplierId,
  WorkspaceBackupV1,
  OperationalCloseId,
  ReconciliationObservationId,
} from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  backupDigest,
  exportWorkspaceBackup,
  getWorkspaceIntegrity,
  validateWorkspaceBackup,
} from "./operations.queries.ts";
import { restoreWorkspaceBackup } from "./restore-workspace.handler.ts";
import { getWorkspaceOperationalProfile } from "../workspace-profile/workspace-profile.ts";
import { adjustCash, createCashAccount } from "../cash/cash.handlers.ts";
import { createSupplier } from "../supplier/supplier.handlers.ts";
import { confirmPurchase, createPurchaseDraft } from "../purchase/purchase.handlers.ts";
import {
  recordGoodsArrival,
  recordQualityDisposition,
  recordQualityInspection,
} from "../intake/intake.handlers.ts";
import { getDispositionSourceSummary, getGoodsArrival } from "../intake/intake.queries.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { recordReconciliationObservation } from "../evidence/evidence.handlers.ts";
import { recordOperationalClose } from "../close/close.handlers.ts";
import { getOperationalClose } from "../close/close.queries.ts";

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
    expect(first.value.payload.memberships).toContainEqual(
      expect.objectContaining({ actorId: ACTOR_ID, roles: ["owner"] }),
    );
    expect(first.value.payload.operationalProfile).toMatchObject({
      workspaceId: WORKSPACE_ID,
      businessDayStartMinute: 0,
      version: 1,
    });
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

  it("rejects a backup whose approved policy collection contains an overlap", async () => {
    const policyEnvelope = (label: string) => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `backup-policy-${label}-${crypto.randomUUID()}`,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
    });
    const definition = {
      contractVersion: 1 as const,
      parameters: {
        defaultTermDays: 7,
        defaultTermLabel: "7 ngày",
        customerTerms: [],
        graceDays: 0,
        agingBuckets: [{ code: "1+", label: "Quá hạn", minDaysOverdue: 1, maxDaysOverdue: null }],
        creditControl: "information_only" as const,
      },
    };
    const firstDraft = await createWorkspacePolicyDraft(harness.ctx, {
      ...policyEnvelope("first-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "payment_terms_aging",
        version: 1,
        effectiveFrom: "2026-08-01T00:00:00.000Z",
        effectiveTo: null,
        definition,
        evidenceReferences: [],
        reason: "Policy đầu tiên.",
      },
    });
    expect(firstDraft.ok).toBe(true);
    if (!firstDraft.ok) return;
    const firstApproval = await approveWorkspacePolicy(harness.ctx, {
      ...policyEnvelope("first-approval"),
      payload: {
        policyVersionId: firstDraft.value.id,
        evidenceReferences: ["field://backup/policy-first"],
        reason: "Đã duyệt policy đầu tiên.",
      },
    });
    expect(firstApproval.ok).toBe(true);
    if (!firstApproval.ok) return;
    const secondDraft = await createWorkspacePolicyDraft(harness.ctx, {
      ...policyEnvelope("second-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "payment_terms_aging",
        version: 2,
        effectiveFrom: "2026-08-02T00:00:00.000Z",
        effectiveTo: null,
        definition,
        evidenceReferences: [],
        reason: "Policy chờ duyệt.",
      },
    });
    expect(secondDraft.ok).toBe(true);
    if (!secondDraft.ok) return;

    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;
    const workspacePolicies = exported.value.payload.workspacePolicies.map((policy) =>
      policy["id"] === secondDraft.value.id
        ? {
            ...policy,
            state: "approved",
            evidenceReferences: ["field://backup/policy-second"],
            approvedBy: ACTOR_ID,
            approvedAt: "2026-08-03T00:00:00.000Z",
          }
        : policy,
    );
    const invalidBackup = {
      ...exported.value,
      payload: { ...exported.value.payload, workspacePolicies },
      digest: backupDigest({ ...exported.value.payload, workspacePolicies }),
    };
    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000791");
    harness.db.registerWorkspace(target, "Vựa overlap policy");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const restored = await restoreWorkspaceBackup(harness.ctx, {
      commandId: crypto.randomUUID(),
      idempotencyKey: "restore-overlap-policy-001",
      workspaceId: target,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
      payload: { backup: invalidBackup, reason: "Reject overlap trong backup." },
    });
    expect(restored.ok).toBe(false);
    if (!restored.ok) expect(restored.error.code).toBe("BACKUP_INTEGRITY_ERROR");
  });

  it("TC-OPS-016 — restores profile, cashbook and inspected intake atomically without duplicates", async () => {
    const cashAccountId = cashAccountIdSchema.parse("00000000-0000-4000-8000-000000000795");
    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      businessDayStartMinute: 22 * 60,
      cashbookMode: "accounts_ledger",
      intakeMode: "inspected_arrival",
      weighingMode: "gross_tare_net",
      version: 2,
    });
    expect(
      (
        await createCashAccount(harness.ctx, {
          commandId: "00000000-0000-4000-8000-000000000793",
          idempotencyKey: "backup-cash-account-key",
          workspaceId: WORKSPACE_ID,
          actorId: ACTOR_ID,
          occurredAt: LATEST_TRANSACTION_TIME,
          payload: {
            cashAccountId,
            displayName: "Két phục hồi",
            kind: "cash_drawer",
            currency: "VND",
            custodianActorId: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await adjustCash(harness.ctx, {
          commandId: "00000000-0000-4000-8000-000000000792",
          idempotencyKey: "backup-cash-opening-key",
          workspaceId: WORKSPACE_ID,
          actorId: ACTOR_ID,
          occurredAt: LATEST_TRANSACTION_TIME,
          payload: {
            adjustmentId: "00000000-0000-4000-8000-000000000791",
            cashAccountId,
            direction: "increase",
            amount: { amountMinor: 900_000, currency: "VND" },
            reasonCode: "opening_balance",
            reason: "Số dư phục hồi",
          },
        })
      ).ok,
    ).toBe(true);
    const envelope = (label: string) => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `backup-intake-${label}-${crypto.randomUUID()}`,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
    });
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const arrivalId = crypto.randomUUID() as GoodsArrivalId;
    const arrivalLineId = crypto.randomUUID() as GoodsArrivalLineId;
    const inspectionId = crypto.randomUUID() as QualityInspectionId;
    const dispositionId = crypto.randomUUID() as QualityDispositionId;
    expect(
      (
        await createSupplier(harness.ctx, {
          ...envelope("supplier"),
          payload: {
            supplierId,
            displayName: "Vựa nguồn backup",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(harness.ctx, {
          ...envelope("purchase"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: PRODUCT_CA_CHUA_ID,
                productName: "Cà chua",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await confirmPurchase(harness.ctx, {
          ...envelope("confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordGoodsArrival(harness.ctx, {
          ...envelope("arrival"),
          payload: {
            arrivalId,
            supplierId,
            purchaseId,
            vehicleReference: "51C-BACKUP",
            lines: [
              {
                arrivalLineId,
                purchaseLineId,
                productId: PRODUCT_CA_CHUA_ID,
                productName: "Cà chua",
                arrivedQuantity: { valueScaled: 100_000, unit: "kg" },
                weighing: {
                  containerCount: 10,
                  grossWeight: { valueScaled: 105_000, unit: "kg" },
                  tareWeight: { valueScaled: 5_000, unit: "kg" },
                  netWeight: { valueScaled: 100_000, unit: "kg" },
                },
                supplierLotCode: "LOT-BACKUP",
                note: null,
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityInspection(harness.ctx, {
          ...envelope("inspection"),
          payload: {
            inspectionId,
            arrivalLineId,
            inspectedQuantity: { valueScaled: 100_000, unit: "kg" },
            issues: [],
            note: null,
            evidenceReferences: ["photo://backup-intake"],
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordQualityDisposition(harness.ctx, {
          ...envelope("disposition"),
          payload: {
            dispositionId,
            source: { type: "arrival_line", arrivalLineId },
            allocations: [
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "accepted",
                quantity: { valueScaled: 80_000, unit: "kg" },
                qualityGradeId: QUALITY_GRADE_1_ID,
                qualityGradeName: "Loại 1",
                note: null,
              },
              {
                allocationId: crypto.randomUUID() as QualityDispositionAllocationId,
                outcome: "rejected",
                quantity: { valueScaled: 20_000, unit: "kg" },
                qualityGradeId: null,
                qualityGradeName: null,
                note: "Không đạt",
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    if (!exported.ok) return;
    expect(exported.value.payload.goodsArrivals).toHaveLength(1);
    expect(exported.value.payload.qualityInspections).toHaveLength(1);
    expect(exported.value.payload.qualityDispositions).toHaveLength(1);
    expect(exported.value.payload.qualityDispositionAllocations).toHaveLength(2);
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
    const restoredProfile = await getWorkspaceOperationalProfile(harness.ctx, target);
    expect(restoredProfile.ok && restoredProfile.value).toMatchObject({
      workspaceId: target,
      businessDayStartMinute: 1320,
      cashbookMode: "accounts_ledger",
      version: 2,
    });
    expect(harness.db.cashBalanceFor(target, cashAccountId)?.balance.amountMinor).toBe(900_000);
    const restoredArrival = await getGoodsArrival(harness.ctx, {
      workspaceId: target,
      arrivalId,
    });
    expect(restoredArrival.ok && restoredArrival.value).toMatchObject({
      id: arrivalId,
      workspaceId: target,
      vehicleReference: "51C-BACKUP",
    });
    const restoredSource = await getDispositionSourceSummary(harness.ctx, {
      workspaceId: target,
      source: { type: "arrival_line", arrivalLineId },
    });
    expect(restoredSource.ok && restoredSource.value).toMatchObject({
      sourceQuantity: { valueScaled: 100_000, unit: "kg" },
      inspectedQuantity: { valueScaled: 100_000, unit: "kg" },
      allocatedQuantity: { valueScaled: 100_000, unit: "kg" },
      eligibleQuantity: { valueScaled: 0, unit: "kg" },
    });
  });

  it("keeps WorkspaceBackupV1 restore-compatible while exporting V19", async () => {
    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    if (!exported.ok) return;
    expect(exported.value.version).toBe(19);
    const {
      suppliers: _suppliers,
      supplierPayments: _supplierPayments,
      supplierPaymentReversals: _supplierPaymentReversals,
      supplierAccountEntries: _supplierAccountEntries,
      purchases: _purchases,
      purchaseLines: _purchaseLines,
      purchaseVoids: _purchaseVoids,
      receipts: _receipts,
      receiptLines: _receiptLines,
      receiptReversals: _receiptReversals,
      inventoryMovements: _inventoryMovements,
      deliveries: _deliveries,
      deliveryLines: _deliveryLines,
      deliveryReturns: _deliveryReturns,
      deliveryReturnLines: _deliveryReturnLines,
      documents: _documents,
      documentShares: _documentShares,
      priceRules: _priceRules,
      qualityGrades: _qualityGrades,
      operationalProfile: _operationalProfile,
      cashAccounts: _cashAccounts,
      expenses: _expenses,
      expenseReversals: _expenseReversals,
      cashTransfers: _cashTransfers,
      cashTransferReversals: _cashTransferReversals,
      cashAdjustments: _cashAdjustments,
      cashMovements: _cashMovements,
      qualityIssueCodes: _qualityIssueCodes,
      goodsArrivals: _goodsArrivals,
      goodsArrivalLines: _goodsArrivalLines,
      goodsArrivalReversals: _goodsArrivalReversals,
      qualityInspections: _qualityInspections,
      qualityInspectionIssues: _qualityInspectionIssues,
      qualityInspectionReversals: _qualityInspectionReversals,
      qualityDispositions: _qualityDispositions,
      qualityDispositionAllocations: _qualityDispositionAllocations,
      qualityDispositionReversals: _qualityDispositionReversals,
      costObservations: _costObservations,
      reconciliationObservations: _reconciliationObservations,
      debtObservations: _debtObservations,
      supplyCommitmentObservations: _supplyCommitmentObservations,
      supplierObservations: _supplierObservations,
      demandObservations: _demandObservations,
      paymentAllocations: _paymentAllocations,
      paymentAllocationReversals: _paymentAllocationReversals,
      customerOrders: _customerOrders,
      customerOrderLines: _customerOrderLines,
      supplyCommitments: _supplyCommitments,
      supplyCommitmentLines: _supplyCommitmentLines,
      workspacePolicies: _workspacePolicies,
      stocktakeSessions: _stocktakeSessions,
      stocktakeCounts: _stocktakeCounts,
      operationalCloses: _operationalCloses,
      operationalCloseReopens: _operationalCloseReopens,
      cashStatementMatches: _cashStatementMatches,
      cashStatementMatchReversals: _cashStatementMatchReversals,
      ...payload
    } = exported.value.payload;
    const legacyPayload = {
      ...payload,
      // Pre-source-evidence V1 backups did not have these metadata columns.
      payments: payload.payments.map(({ evidenceReferences: _evidenceReferences, ...row }) => row),
      paymentReversals: payload.paymentReversals.map(
        ({ evidenceReferences: _evidenceReferences, ...row }) => row,
      ),
    };
    const legacy: WorkspaceBackupV1 = {
      format: "vuarau.workspace-backup",
      version: 1,
      sourceWorkspaceId: exported.value.sourceWorkspaceId,
      createdAt: exported.value.createdAt,
      schemaCompatibility: "m15",
      recordCounts: Object.fromEntries(
        Object.entries(legacyPayload).map(([name, rows]) => [
          name,
          Array.isArray(rows) ? rows.length : 1,
        ]),
      ),
      payload: legacyPayload,
      digest: backupDigest(legacyPayload),
    };
    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000797");
    harness.db.registerWorkspace(target, "Vựa phục hồi V1");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const restored = await restoreWorkspaceBackup(harness.ctx, {
      commandId: "00000000-0000-4000-8000-000000000796",
      idempotencyKey: "restore-backup-v1-key",
      workspaceId: target,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
      payload: { backup: legacy, reason: "Kiểm tra tương thích V1" },
    });
    expect(restored.ok).toBe(true);
  });

  it("TC-OPS-018 — Backup V19 preserves operational close policy and observation lineage", async () => {
    const envelope = (label: string) => ({
      commandId: crypto.randomUUID(),
      idempotencyKey: `backup-close-${label}-${crypto.randomUUID()}`,
      workspaceId: WORKSPACE_ID,
      actorId: ACTOR_ID,
      occurredAt: LATEST_TRANSACTION_TIME,
    });
    const policyVersionId = crypto.randomUUID();
    expect(
      (
        await createWorkspacePolicyDraft(harness.ctx, {
          ...envelope("policy-draft"),
          payload: {
            policyVersionId,
            policyKind: "operating_cycle_reconciliation",
            version: 1,
            effectiveFrom: "2020-01-01T00:00:00.000Z",
            effectiveTo: null,
            definition: {
              contractVersion: 1,
              parameters: {
                strategy: "observation_signoff",
                requiredObservationKinds: ["cash_count"],
                allowReopen: true,
              },
            },
            evidenceReferences: [],
            reason: "Policy close cho diễn tập backup.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(harness.ctx, {
          ...envelope("policy-approve"),
          payload: {
            policyVersionId,
            evidenceReferences: ["policy://backup-close/001"],
            reason: "Đã duyệt policy close cho diễn tập.",
          },
        })
      ).ok,
    ).toBe(true);
    const observationId = crypto.randomUUID() as ReconciliationObservationId;
    expect(
      (
        await recordReconciliationObservation(harness.ctx, {
          ...envelope("observation"),
          payload: {
            reconciliationObservationId: observationId,
            kind: "cash_count",
            caseKind: "normal",
            description: "Đếm tiền cuối ngày.",
            participantWording: "Đã kiểm tra cùng thủ quỹ.",
            facts: {
              expectedAmount: { amountMinor: 900_000, currency: "VND" },
              observedAmount: { amountMinor: 900_000, currency: "VND" },
              expectedQuantity: null,
              observedQuantity: null,
              itemCount: 1,
              productId: null,
              qualityGradeId: null,
              scopeReference: "cash://backup-close",
            },
            evidenceReferences: ["photo://backup-close/001"],
            relatedObservationId: null,
          },
        })
      ).ok,
    ).toBe(true);
    const operationalCloseId = crypto.randomUUID() as OperationalCloseId;
    const closed = await recordOperationalClose(harness.ctx, {
      ...envelope("close"),
      payload: {
        operationalCloseId,
        businessDate: "2026-07-23",
        observationIds: [observationId],
        evidenceReferences: ["review://backup-close/001"],
        reason: "Đã signoff cuối ngày.",
      },
    });
    expect(closed).toMatchObject({ ok: true, value: { policyVersionId, state: "closed" } });

    const exported = await exportWorkspaceBackup(harness.ctx, exportInput());
    expect(exported).toMatchObject({
      ok: true,
      value: {
        version: 19,
        payload: {
          operationalCloses: [expect.objectContaining({ id: operationalCloseId })],
          operationalCloseReopens: [],
        },
      },
    });
    if (!exported.ok) return;
    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000805");
    harness.db.registerWorkspace(target, "Vựa phục hồi close");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const restored = await restoreWorkspaceBackup(harness.ctx, {
      ...envelope("restore"),
      workspaceId: target,
      payload: { backup: exported.value, reason: "Phục hồi lineage close" },
    });
    expect(restored).toMatchObject({ ok: true });
    const read = await getOperationalClose(harness.ctx, {
      workspaceId: target,
      operationalCloseId,
    });
    expect(read).toMatchObject({ ok: true, value: { workspaceId: target, policyVersionId } });
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
