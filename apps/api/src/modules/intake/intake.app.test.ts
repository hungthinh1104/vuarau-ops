import { beforeEach, describe, expect, it } from "vitest";
import {
  defaultWorkspaceOperationalProfile,
  type GoodsArrivalId,
  type GoodsArrivalLineId,
  type PurchaseId,
  type PurchaseLineId,
  type QualityDispositionAllocationId,
  type QualityDispositionId,
  type QualityDispositionReversalId,
  type QualityInspectionId,
  type QualityInspectionReversalId,
  type SupplierId,
} from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  LATEST_TRANSACTION_TIME,
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { createSupplier } from "../supplier/supplier.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  voidPurchase,
} from "../purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../inventory/inventory.handlers.ts";
import {
  recordGoodsArrival,
  recordQualityDisposition,
  recordQualityInspection,
  reverseGoodsArrival,
  reverseQualityDisposition,
  reverseQualityInspection,
} from "./intake.handlers.ts";
import { getArrivalLineHistory, getDispositionSourceSummary } from "./intake.queries.ts";

let harness: Harness;
let sequence = 0;
const uuid = <T extends string>(): T => crypto.randomUUID() as T;
const envelope = (label: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `${label}-${++sequence}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATEST_TRANSACTION_TIME,
});

async function confirmedPurchase() {
  const supplierId = uuid<SupplierId>();
  const purchaseId = uuid<PurchaseId>();
  const purchaseLineId = uuid<PurchaseLineId>();
  expect(
    (
      await createSupplier(harness.ctx, {
        ...envelope("supplier"),
        payload: {
          supplierId,
          displayName: "Vựa nguồn kiểm định",
          phone: null,
          note: null,
        },
      })
    ).ok,
  ).toBe(true);
  const draft = await createPurchaseDraft(harness.ctx, {
    ...envelope("purchase-draft"),
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
  });
  expect(draft.ok).toBe(true);
  const confirmed = await confirmPurchase(harness.ctx, {
    ...envelope("purchase-confirm"),
    expectedVersion: 1,
    payload: { purchaseId },
  });
  expect(confirmed.ok).toBe(true);
  return { supplierId, purchaseId, purchaseLineId };
}

beforeEach(() => {
  sequence = 0;
  harness = createHarness();
});

describe("inspected intake application", () => {
  it("TC-INTAKE-007 — keeps direct receiving and inspected intake mutually exclusive", async () => {
    const purchase = await confirmedPurchase();
    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      intakeMode: "inspected_arrival",
      weighingMode: "gross_tare_net",
      version: 2,
    });
    const direct = await recordPurchaseReceipt(harness.ctx, {
      ...envelope("direct-receipt"),
      payload: {
        receiptId: crypto.randomUUID(),
        purchaseId: purchase.purchaseId,
        lines: [
          {
            receiptLineId: crypto.randomUUID(),
            purchaseLineId: purchase.purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
      },
    });
    expect(direct.ok).toBe(false);
    if (!direct.ok) {
      expect(direct.error).toMatchObject({
        code: "WORKSPACE_WORKFLOW_DISABLED",
        details: { workflow: "direct_receiving" },
      });
    }

    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      intakeMode: "direct_receipt",
      weighingMode: "quantity_only",
      version: 3,
    });
    const arrival = await recordGoodsArrival(harness.ctx, {
      ...envelope("blocked-arrival"),
      payload: {
        arrivalId: uuid<GoodsArrivalId>(),
        supplierId: purchase.supplierId,
        purchaseId: purchase.purchaseId,
        vehicleReference: null,
        lines: [
          {
            arrivalLineId: uuid<GoodsArrivalLineId>(),
            purchaseLineId: purchase.purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua",
            arrivedQuantity: { valueScaled: 10_000, unit: "kg" },
            weighing: null,
            supplierLotCode: null,
            note: null,
          },
        ],
        note: null,
      },
    });
    expect(arrival.ok).toBe(false);
    if (!arrival.ok) {
      expect(arrival.error).toMatchObject({
        code: "WORKSPACE_WORKFLOW_DISABLED",
        details: { workflow: "inspected_intake" },
      });
    }
  });

  it("TC-INTAKE-008 — arrival, weighing, inspection and disposition drive inventory then reverse in dependency order", async () => {
    const purchase = await confirmedPurchase();
    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      intakeMode: "inspected_arrival",
      weighingMode: "gross_tare_net",
      version: 2,
    });
    const arrivalId = uuid<GoodsArrivalId>();
    const arrivalLineId = uuid<GoodsArrivalLineId>();
    const arrival = await recordGoodsArrival(harness.ctx, {
      ...envelope("arrival"),
      payload: {
        arrivalId,
        supplierId: purchase.supplierId,
        purchaseId: purchase.purchaseId,
        vehicleReference: "51C-123.45",
        lines: [
          {
            arrivalLineId,
            purchaseLineId: purchase.purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua",
            arrivedQuantity: { valueScaled: 100_000, unit: "kg" },
            weighing: {
              containerCount: 10,
              grossWeight: { valueScaled: 105_000, unit: "kg" },
              tareWeight: { valueScaled: 5_000, unit: "kg" },
              netWeight: { valueScaled: 100_000, unit: "kg" },
            },
            supplierLotCode: "LOT-20-07",
            note: null,
          },
        ],
        note: null,
      },
    });
    expect(arrival.ok).toBe(true);

    const inspectionId = uuid<QualityInspectionId>();
    const inspection = await recordQualityInspection(harness.ctx, {
      ...envelope("inspection"),
      payload: {
        inspectionId,
        arrivalLineId,
        inspectedQuantity: { valueScaled: 80_000, unit: "kg" },
        issues: [],
        note: "Kiểm 80 kg đầu tiên",
        evidenceReferences: ["photo://arrival-1"],
      },
    });
    expect(inspection.ok).toBe(true);

    const dispositionId = uuid<QualityDispositionId>();
    const acceptedAllocationId = uuid<QualityDispositionAllocationId>();
    const quarantinedAllocationId = uuid<QualityDispositionAllocationId>();
    const disposition = await recordQualityDisposition(harness.ctx, {
      ...envelope("disposition"),
      payload: {
        dispositionId,
        source: { type: "arrival_line", arrivalLineId },
        allocations: [
          {
            allocationId: acceptedAllocationId,
            outcome: "accepted",
            quantity: { valueScaled: 60_000, unit: "kg" },
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            note: "Nhập kho",
          },
          {
            allocationId: quarantinedAllocationId,
            outcome: "quarantined",
            quantity: { valueScaled: 20_000, unit: "kg" },
            qualityGradeId: null,
            qualityGradeName: null,
            note: "Chờ kiểm lại",
          },
        ],
        note: null,
      },
    });
    expect(disposition.ok).toBe(true);
    const acceptedMovements = harness.db
      .inventoryMovementRecords()
      .filter(
        (movement) =>
          movement.sourceType === "quality_disposition" && movement.sourceId === dispositionId,
      );
    expect(acceptedMovements).toHaveLength(1);
    expect(acceptedMovements[0]?.quantity.valueScaled).toBe(60_000);

    const source = await getDispositionSourceSummary(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      source: { type: "arrival_line", arrivalLineId },
    });
    expect(source.ok && source.value).toMatchObject({
      sourceQuantity: { valueScaled: 100_000, unit: "kg" },
      inspectedQuantity: { valueScaled: 80_000, unit: "kg" },
      allocatedQuantity: { valueScaled: 80_000, unit: "kg" },
      eligibleQuantity: { valueScaled: 0, unit: "kg" },
    });
    const history = await getArrivalLineHistory(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      arrivalLineId,
    });
    expect(history.ok && history.value).toMatchObject({
      arrivalLineId,
      inspections: [{ id: inspectionId, reversal: null }],
      dispositions: [{ id: dispositionId, reversal: null }],
    });
    const quarantineResolutionId = uuid<QualityDispositionId>();
    const quarantineResolution = await recordQualityDisposition(harness.ctx, {
      ...envelope("quarantine-resolution"),
      payload: {
        dispositionId: quarantineResolutionId,
        source: { type: "quarantine_allocation", allocationId: quarantinedAllocationId },
        allocations: [
          {
            allocationId: uuid<QualityDispositionAllocationId>(),
            outcome: "accepted",
            quantity: { valueScaled: 10_000, unit: "kg" },
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            note: "Đạt sau kiểm lại",
          },
          {
            allocationId: uuid<QualityDispositionAllocationId>(),
            outcome: "rejected",
            quantity: { valueScaled: 10_000, unit: "kg" },
            qualityGradeId: null,
            qualityGradeName: null,
            note: "Không đạt sau kiểm lại",
          },
        ],
        note: null,
      },
    });
    expect(quarantineResolution.ok).toBe(true);
    const historyWithChild = await getArrivalLineHistory(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      arrivalLineId,
    });
    expect(historyWithChild.ok && historyWithChild.value.dispositions).toHaveLength(2);

    const blockedVoid = await voidPurchase(harness.ctx, {
      ...envelope("blocked-void"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId: purchase.purchaseId,
        reasonCode: "wrong_quantity",
        reason: "Kiểm tra khóa hàng đã đến",
      },
    });
    expect(blockedVoid.ok).toBe(false);
    if (!blockedVoid.ok) expect(blockedVoid.error.code).toBe("PURCHASE_HAS_ACTIVE_RECEIPTS");

    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      intakeMode: "direct_receipt",
      weighingMode: "quantity_only",
      version: 3,
    });
    const blockedParentReversal = await reverseQualityDisposition(harness.ctx, {
      ...envelope("blocked-parent-reversal"),
      payload: {
        reversalId: uuid<QualityDispositionReversalId>(),
        dispositionId,
        reason: "Thử hoàn tác sai thứ tự",
      },
    });
    expect(blockedParentReversal.ok).toBe(false);
    if (!blockedParentReversal.ok) {
      expect(blockedParentReversal.error.code).toBe("QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS");
    }
    const reversedChildDisposition = await reverseQualityDisposition(harness.ctx, {
      ...envelope("reverse-child-disposition"),
      payload: {
        reversalId: uuid<QualityDispositionReversalId>(),
        dispositionId: quarantineResolutionId,
        reason: "Ghi nhầm xử lý lượng cách ly",
      },
    });
    expect(reversedChildDisposition.ok).toBe(true);
    const dispositionReversalId = uuid<QualityDispositionReversalId>();
    const reversedDisposition = await reverseQualityDisposition(harness.ctx, {
      ...envelope("reverse-disposition"),
      payload: {
        reversalId: dispositionReversalId,
        dispositionId,
        reason: "Ghi nhầm quyết định",
      },
    });
    expect(reversedDisposition.ok).toBe(true);
    expect(
      harness.db
        .inventoryMovementRecords()
        .filter(
          (movement) =>
            movement.sourceType === "quality_disposition" ||
            movement.sourceType === "quality_disposition_reversal",
        )
        .reduce((sum, movement) => sum + movement.quantity.valueScaled, 0),
    ).toBe(0);

    const reversedInspection = await reverseQualityInspection(harness.ctx, {
      ...envelope("reverse-inspection"),
      payload: {
        reversalId: uuid<QualityInspectionReversalId>(),
        inspectionId,
        reason: "Ghi nhầm kiểm định",
      },
    });
    expect(reversedInspection.ok).toBe(true);
    const reversedArrival = await reverseGoodsArrival(harness.ctx, {
      ...envelope("reverse-arrival"),
      payload: {
        reversalId: crypto.randomUUID(),
        arrivalId,
        reason: "Ghi nhầm lần hàng đến",
      },
    });
    expect(reversedArrival.ok).toBe(true);

    const allowedVoid = await voidPurchase(harness.ctx, {
      ...envelope("allowed-void"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId: purchase.purchaseId,
        reasonCode: "wrong_quantity",
        reason: "Đã hoàn tác toàn bộ chuỗi hàng thật",
      },
    });
    expect(allowedVoid.ok).toBe(true);
  });
});
