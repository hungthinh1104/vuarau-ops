import { beforeEach, describe, expect, it } from "vitest";
import type { PurchaseId, PurchaseLineId } from "@vuarau/domain-contracts";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  SUPPLIER_ID,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { confirmPurchase, createPurchaseDraft, voidPurchase } from "./purchase.handlers.ts";
import { getPurchase } from "./purchase.queries.ts";
import { getPurchaseReceivingSummary } from "../inventory/inventory.queries.ts";
import { recordPurchaseReceipt } from "../inventory/inventory.handlers.ts";
import { getSupplierBalance } from "../supplier/supplier.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (label: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `purchase-correction-${label}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: harness.ctx.principal.actorId,
  occurredAt: "2026-07-20T05:00:00.000Z",
});

describe("Purchase correction after Receiving", () => {
  it("TC-PURCHASE-CORRECTION-002 keeps accepted goods on the original Purchase and gives the replacement fresh receiving progress", async () => {
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const policyVersionId = crypto.randomUUID();
    const draftPolicy = await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope("policy-draft"),
      payload: {
        policyVersionId,
        policyKind: "purchase_correction",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { afterReceiving: "commercial_replacement_only" },
        },
        evidenceReferences: [],
        reason: "Cho phép sửa thương mại, không đảo hàng thật.",
      },
    });
    expect(draftPolicy.ok).toBe(true);
    const approvedPolicy = await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve"),
      payload: {
        policyVersionId,
        evidenceReferences: ["field://purchase-correction/approved-001"],
        reason: "Đã duyệt strategy cho workspace.",
      },
    });
    expect(approvedPolicy.ok).toBe(true);

    const purchase = await createPurchaseDraft(harness.ctx, {
      ...envelope("create"),
      payload: {
        purchaseId,
        supplierId: SUPPLIER_ID,
        currency: "VND",
        lines: [
          {
            lineId: purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua",
            quantity: { valueScaled: 100_000, unit: "kg" },
            unitPrice: { amountMinor: 10_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesPurchaseId: null,
      },
    });
    expect(purchase.ok).toBe(true);
    const confirmed = await confirmPurchase(harness.ctx, {
      ...envelope("confirm"),
      expectedVersion: 1,
      payload: { purchaseId },
    });
    expect(confirmed.ok).toBe(true);
    const receiptId = crypto.randomUUID();
    const receipt = await recordPurchaseReceipt(harness.ctx, {
      ...envelope("receipt-original"),
      payload: {
        receiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: crypto.randomUUID(),
            purchaseLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 60_000, unit: "kg" },
          },
        ],
        note: null,
        evidenceReferences: ["photo://original-receipt"],
      },
    });
    expect(receipt.ok).toBe(true);

    const beforePolicyEffect = await getPurchaseReceivingSummary(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      purchaseId,
    });
    expect(beforePolicyEffect.ok && beforePolicyEffect.value.capabilities).toMatchObject({
      voidPurchase: { allowed: false, reasonCode: "PURCHASE_HAS_ACTIVE_RECEIPTS" },
      commercialCorrection: { allowed: true },
    });

    const correction = await voidPurchase(harness.ctx, {
      ...envelope("commercial-correction"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId,
        reasonCode: "commercial_correction",
        reason: "Sai giá trên chứng từ; hàng đã nhận vẫn giữ nguyên.",
        evidenceReferences: ["photo://commercial-correction"],
      },
    });
    expect(correction.ok).toBe(true);
    if (!correction.ok) return;
    expect(correction.value.voidRecord?.policyVersionId).toBe(policyVersionId);

    const originalAfter = await getPurchase(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      purchaseId,
    });
    expect(originalAfter.ok && originalAfter.value.voidRecord?.policyVersionId).toBe(
      policyVersionId,
    );
    const originalSummary = await getPurchaseReceivingSummary(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      purchaseId,
    });
    expect(originalSummary.ok && originalSummary.value.lines[0]?.received.valueScaled).toBe(60_000);

    const replacementId = crypto.randomUUID() as PurchaseId;
    const replacementLineId = crypto.randomUUID() as PurchaseLineId;
    const replacement = await createPurchaseDraft(harness.ctx, {
      ...envelope("replacement-create"),
      payload: {
        purchaseId: replacementId,
        supplierId: SUPPLIER_ID,
        currency: "VND",
        lines: [
          {
            lineId: replacementLineId,
            productId: PRODUCT_CA_CHUA_ID,
            productName: "Cà chua thay thế",
            quantity: { valueScaled: 40_000, unit: "kg" },
            unitPrice: { amountMinor: 11_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesPurchaseId: purchaseId,
      },
    });
    expect(replacement.ok).toBe(true);
    const replacementConfirmed = await confirmPurchase(harness.ctx, {
      ...envelope("replacement-confirm"),
      expectedVersion: 1,
      payload: { purchaseId: replacementId },
    });
    expect(replacementConfirmed.ok).toBe(true);
    const replacementReceipt = await recordPurchaseReceipt(harness.ctx, {
      ...envelope("receipt-replacement"),
      payload: {
        receiptId: crypto.randomUUID(),
        purchaseId: replacementId,
        lines: [
          {
            receiptLineId: crypto.randomUUID(),
            purchaseLineId: replacementLineId,
            productId: PRODUCT_CA_CHUA_ID,
            qualityGradeId: QUALITY_GRADE_1_ID,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
        evidenceReferences: [],
      },
    });
    expect(replacementReceipt.ok).toBe(true);
    const replacementSummary = await getPurchaseReceivingSummary(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      purchaseId: replacementId,
    });
    expect(replacementSummary.ok && replacementSummary.value.lines[0]?.received.valueScaled).toBe(
      10_000,
    );

    const payable = await getSupplierBalance(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId: SUPPLIER_ID,
    });
    expect(payable.ok && payable.value?.balance.amountMinor).toBe(440_000);
  });

  it("TC-PURCHASE-CORRECTION-003 fails closed when the correction policy is absent", async () => {
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      (
        await createPurchaseDraft(harness.ctx, {
          ...envelope("unconfigured-create"),
          payload: {
            purchaseId,
            supplierId: SUPPLIER_ID,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: PRODUCT_CA_CHUA_ID,
                productName: "Cà chua",
                quantity: { valueScaled: 10_000, unit: "kg" },
                unitPrice: { amountMinor: 10_000, currency: "VND" },
              },
            ],
            note: null,
            evidenceReferences: [],
            dueAt: null,
            replacesPurchaseId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await confirmPurchase(harness.ctx, {
          ...envelope("unconfigured-confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(harness.ctx, {
          ...envelope("unconfigured-receipt"),
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
                quantity: { valueScaled: 1_000, unit: "kg" },
              },
            ],
            note: null,
            evidenceReferences: [],
          },
        })
      ).ok,
    ).toBe(true);
    const blocked = await voidPurchase(harness.ctx, {
      ...envelope("unconfigured-correction"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId,
        reasonCode: "commercial_correction",
        reason: "Không được tự đoán policy.",
        evidenceReferences: [],
      },
    });
    expect(blocked).toMatchObject({
      ok: false,
      error: { code: "PURCHASE_CORRECTION_POLICY_UNAVAILABLE" },
    });
  });
});
