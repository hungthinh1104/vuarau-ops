import { beforeEach, describe, expect, it } from "vitest";
import type { PurchaseId, PurchaseLineId } from "@vuarau/domain-contracts";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SUPPLIER_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { createPurchaseDraft, confirmPurchase } from "../purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "./inventory.handlers.ts";
import { getStockPlanning } from "./inventory.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (label: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `stock-planning-${label}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: harness.ctx.principal.actorId,
  occurredAt: TRANSACTION_TIME,
});

describe("stock planning", () => {
  it("TC-PLANNING-001 stays unavailable until a policy is explicitly approved", async () => {
    const unavailable = await getStockPlanning(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: TRANSACTION_TIME,
    });
    expect(unavailable.ok).toBe(true);
    if (unavailable.ok) {
      expect(unavailable.value).toMatchObject({
        status: "unavailable",
        diagnostics: ["no_effective_stock_planning_policy"],
      });
    }
  });

  it("TC-PLANNING-002 derives threshold and source lineage from inventory facts", async () => {
    const policyVersionId = crypto.randomUUID();
    expect(
      await createWorkspacePolicyDraft(harness.ctx, {
        ...envelope("policy-draft"),
        payload: {
          policyVersionId,
          policyKind: "stock_planning_reorder",
          version: 1,
          effectiveFrom: "2026-07-01T00:00:00.000Z",
          effectiveTo: null,
          definition: {
            contractVersion: 1,
            parameters: {
              strategy: "fixed_threshold",
              rules: [
                {
                  productId: PRODUCT_CA_CHUA_ID,
                  qualityGradeId: QUALITY_GRADE_1_ID,
                  unit: "kg",
                  minimumQuantity: { valueScaled: 50_000, unit: "kg" },
                  targetQuantity: { valueScaled: 100_000, unit: "kg" },
                },
              ],
            },
          },
          evidenceReferences: [],
          reason: "Thiết lập ngưỡng tồn tối thiểu và mục tiêu.",
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await approveWorkspacePolicy(harness.ctx, {
        ...envelope("policy-approve"),
        payload: {
          policyVersionId,
          evidenceReferences: ["field://planning/threshold-001"],
          reason: "Chủ vựa phê duyệt ngưỡng tồn.",
        },
      }),
    ).toMatchObject({ ok: true });

    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      await createPurchaseDraft(harness.ctx, {
        ...envelope("purchase-create"),
        payload: {
          purchaseId,
          supplierId: SUPPLIER_ID,
          currency: "VND",
          lines: [
            {
              lineId: purchaseLineId,
              productId: PRODUCT_CA_CHUA_ID,
              productName: "Cà chua",
              quantity: { valueScaled: 30_000, unit: "kg" },
              unitPrice: { amountMinor: 100, currency: "VND" },
            },
          ],
          note: null,
          evidenceReferences: [],
          dueAt: null,
          replacesPurchaseId: null,
        },
      }),
    ).toMatchObject({ ok: true });
    expect(
      await confirmPurchase(harness.ctx, {
        ...envelope("purchase-confirm"),
        payload: { purchaseId },
        expectedVersion: 1,
      }),
    ).toMatchObject({ ok: true });
    expect(
      await recordPurchaseReceipt(harness.ctx, {
        ...envelope("receipt"),
        payload: {
          receiptId: crypto.randomUUID(),
          purchaseId,
          lines: [
            {
              receiptLineId: crypto.randomUUID(),
              purchaseLineId,
              productId: PRODUCT_CA_CHUA_ID,
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 30_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: ["photo://planning-receipt-001"],
        },
      }),
    ).toMatchObject({ ok: true });

    const result = await getStockPlanning(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: TRANSACTION_TIME,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        status: "available",
        policyVersionId,
        strategy: "fixed_threshold",
        calculationVersion: "stock-planning-v1",
        rows: [
          {
            currentQuantity: { valueScaled: 30_000, unit: "kg" },
            suggestedQuantity: { valueScaled: 70_000, unit: "kg" },
            reorderRequired: true,
          },
        ],
      });
      expect(result.value.rows[0]?.sourceMovementIds).toHaveLength(1);
    }
  });
});
