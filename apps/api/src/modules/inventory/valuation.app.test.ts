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
import { getInventoryValuation } from "./inventory.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (label: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `valuation-${label}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: harness.ctx.principal.actorId,
  occurredAt: TRANSACTION_TIME,
});

describe("BR-VALUATION-001 / BR-VALUATION-002 / BR-VALUATION-003 / TC-VALUATION-002", () => {
  it("keeps valuation unavailable until a versioned policy is effective", async () => {
    const productId = PRODUCT_CA_CHUA_ID;
    const unavailable = await getInventoryValuation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId,
      qualityGradeId: null,
      unit: null,
      asOf: TRANSACTION_TIME,
    });
    expect(unavailable.ok).toBe(true);
    if (unavailable.ok) {
      expect(unavailable.value).toMatchObject({
        status: "unavailable",
        diagnostics: ["no_effective_inventory_valuation_policy"],
      });
    }

    const policyVersionId = crypto.randomUUID();
    const draft = await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope("policy-draft"),
      payload: {
        policyVersionId,
        policyKind: "inventory_valuation",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { strategy: "moving_weighted_average" },
        },
        evidenceReferences: [],
        reason: "Định giá theo bình quân gia quyền đã được chọn.",
      },
    });
    expect(draft.ok).toBe(true);
    const approved = await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve"),
      payload: {
        policyVersionId,
        evidenceReferences: ["field://valuation/001"],
        reason: "Đã phê duyệt policy định giá.",
      },
    });
    expect(approved.ok).toBe(true);

    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const purchase = await createPurchaseDraft(harness.ctx, {
      ...envelope("purchase-create"),
      payload: {
        purchaseId,
        supplierId: SUPPLIER_ID,
        currency: "VND",
        lines: [
          {
            lineId: purchaseLineId,
            productId,
            productName: "Cà chua",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 100, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesPurchaseId: null,
      },
    });
    expect(purchase.ok).toBe(true);
    expect(
      await confirmPurchase(harness.ctx, {
        ...envelope("purchase-confirm"),
        expectedVersion: 1,
        payload: { purchaseId },
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
              productId,
              qualityGradeId: QUALITY_GRADE_1_ID,
              qualityGradeName: "Loại 1",
              quantity: { valueScaled: 1_000, unit: "kg" },
            },
          ],
          note: null,
          evidenceReferences: ["photo://valuation-receipt"],
        },
      }),
    ).toMatchObject({ ok: true });

    const result = await getInventoryValuation(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      productId,
      qualityGradeId: QUALITY_GRADE_1_ID,
      unit: "kg",
      asOf: TRANSACTION_TIME,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        status: "available",
        policyVersionId,
        strategy: "moving_weighted_average",
        calculationVersion: "inventory-valuation-v1",
        integrity: "healthy",
        rows: [
          {
            quantityScaled: 1_000,
            inventoryValue: { amountMinor: 100, currency: "VND" },
          },
        ],
      });
      expect(result.value.inputReferences).toHaveLength(1);
    }
  });
});
