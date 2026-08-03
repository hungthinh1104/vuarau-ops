import { describe, expect, it } from "vitest";
import type {
  ConfirmPurchaseCommand,
  CreatePurchaseDraftCommand,
  PurchaseId,
  PurchaseLineId,
  SupplierId,
  ProductId,
  VoidPurchaseCommand,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import {
  canVoidPurchase,
  decideConfirmPurchase,
  decideCreatePurchaseDraft,
  decideUpdatePurchaseDraft,
  decideVoidPurchase,
  resolvePurchaseCorrectionPolicy,
} from "./index.ts";

const command = {
  commandId: crypto.randomUUID(),
  idempotencyKey: "purchase-domain",
  workspaceId: crypto.randomUUID(),
  actorId: crypto.randomUUID(),
  occurredAt: "2026-07-29T01:00:00.000Z",
};
const create = (quantity = 2_000): CreatePurchaseDraftCommand =>
  ({
    ...command,
    payload: {
      purchaseId: crypto.randomUUID() as PurchaseId,
      supplierId: crypto.randomUUID() as SupplierId,
      currency: "VND",
      lines: [
        {
          lineId: crypto.randomUUID() as PurchaseLineId,
          productId: crypto.randomUUID() as ProductId,
          productName: "Cà chua snapshot",
          quantity: { valueScaled: quantity, unit: "kg" },
          unitPrice: { amountMinor: 25_000, currency: "VND" },
        },
      ],
      note: null,
      dueAt: null,
      replacesPurchaseId: null,
    },
  }) as unknown as CreatePurchaseDraftCommand;

describe("Purchase lifecycle", () => {
  it("uses canonical Sale arithmetic and freezes a confirmed snapshot", () => {
    const draft = decideCreatePurchaseDraft(create(), "2026-07-29T01:00:01.000Z");
    expect(draft.ok && draft.value.totalAmount.amountMinor).toBe(50_000);
    if (!draft.ok) return;
    const confirmed = decideConfirmPurchase(
      draft.value,
      {
        ...command,
        expectedVersion: 1,
        payload: { purchaseId: draft.value.id },
      } as ConfirmPurchaseCommand,
      "2026-07-29T01:00:02.000Z",
    );
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    const edit = decideUpdatePurchaseDraft(
      confirmed.value,
      {
        ...create(),
        expectedVersion: 2,
      },
      "2026-07-29T01:00:03.000Z",
    );
    expect(edit.ok).toBe(false);
    if (!edit.ok) expect(edit.error.code).toBe("PURCHASE_ALREADY_CONFIRMED");
  });

  it("requires a confirmed Purchase and a nonblank reason to void", () => {
    const draft = decideCreatePurchaseDraft(create(), "2026-07-29T01:00:01.000Z");
    if (!draft.ok) throw new Error("fixture failed");
    const result = decideVoidPurchase(
      draft.value,
      {
        ...command,
        payload: {
          purchaseVoidId: crypto.randomUUID(),
          purchaseId: draft.value.id,
          reasonCode: "other",
          reason: "Sai chứng từ",
        },
      } as VoidPurchaseCommand,
      "2026-07-29T01:00:02.000Z",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("PURCHASE_NOT_CONFIRMED");
  });

  it("TC-PURCHASE-CORRECTION-001 only authorizes active-receiving correction with an effective policy", () => {
    const draft = decideCreatePurchaseDraft(create(), "2026-07-29T01:00:01.000Z");
    if (!draft.ok) throw new Error("fixture failed");
    const policy = {
      id: crypto.randomUUID(),
      workspaceId: draft.value.workspaceId,
      policyKind: "purchase_correction",
      version: 1,
      state: "approved",
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveTo: null,
      definition: {
        contractVersion: 1,
        parameters: { afterReceiving: "commercial_replacement_only" },
      },
      evidenceReferences: ["field://purchase-correction/001"],
      createdBy: draft.value.workspaceId,
      createdAt: "2026-07-01T00:00:00.000Z",
      approvedBy: draft.value.workspaceId,
      approvedAt: "2026-07-01T00:00:00.000Z",
      retiredBy: null,
      retiredAt: null,
      commandId: draft.value.workspaceId,
      reason: "Core correction strategy",
    } as unknown as WorkspacePolicyDto;
    const effective = resolvePurchaseCorrectionPolicy([policy], "2026-07-29T01:00:00.000Z");
    const confirmed = {
      ...draft.value,
      status: "confirmed" as const,
      confirmedAt: "2026-07-29T01:00:02.000Z" as const,
    };
    expect(effective?.policyVersionId).toBe(policy.id);
    expect(
      canVoidPurchase({
        purchase: confirmed,
        hasActiveReceipts: true,
        reasonCode: "other",
      }).reasonCode,
    ).toBe("PURCHASE_HAS_ACTIVE_RECEIPTS");
    expect(
      canVoidPurchase({
        purchase: confirmed,
        hasActiveReceipts: true,
        reasonCode: "commercial_correction",
        correctionPolicyVersionId: effective?.policyVersionId ?? null,
      }),
    ).toEqual({ allowed: true });
    const voided = decideVoidPurchase(
      confirmed,
      {
        ...command,
        payload: {
          purchaseVoidId: crypto.randomUUID(),
          purchaseId: draft.value.id,
          reasonCode: "commercial_correction",
          reason: "Sai giá trên chứng từ, hàng vẫn ở kho",
        },
      } as VoidPurchaseCommand,
      "2026-07-29T01:00:03.000Z",
      effective!.policyVersionId,
    );
    expect(voided.ok && voided.value.policyVersionId).toBe(effective?.policyVersionId);
  });
});
