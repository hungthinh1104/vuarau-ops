import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { PurchaseId, PurchaseLineId, SupplierId } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  voidPurchase,
} from "../../../modules/purchase/purchase.handlers.ts";
import { getPurchase } from "../../../modules/purchase/purchase.queries.ts";
import { getPurchaseReceivingSummary } from "../../../modules/inventory/inventory.queries.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import { getInventoryBalances } from "../../../modules/inventory/inventory.queries.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import { getSupplierBalance } from "../../../modules/supplier/supplier.queries.ts";

describe.skipIf(skipWithoutDatabase())("Purchase correction against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `purchase-correction-db-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`purchase-correction-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-20T11:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-PURCHASE-CORRECTION-004 preserves original receiving and replacement progress on PostgreSQL", async () => {
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const policyVersionId = crypto.randomUUID();
    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: { supplierId, displayName: "Nhà cung cấp correction", phone: null, note: null },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("policy-draft"),
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
            reason: "Strategy sửa thương mại không đảo physical truth.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("policy-approve"),
          payload: {
            policyVersionId,
            evidenceReferences: ["field://purchase-correction/postgres-001"],
            reason: "Đã phê duyệt.",
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("purchase-draft"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                quantity: { valueScaled: 50_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
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
        await confirmPurchase(context(), {
          ...command("purchase-confirm"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(context(), {
          ...command("receipt"),
          payload: {
            receiptId: crypto.randomUUID(),
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID(),
                purchaseLineId,
                productId: ctx.productIds[0],
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 20_000, unit: "kg" },
              },
            ],
            note: null,
            evidenceReferences: ["photo://postgres-receipt"],
          },
        })
      ).ok,
    ).toBe(true);

    const summary = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(summary.ok && summary.value.capabilities).toMatchObject({
      voidPurchase: { allowed: false, reasonCode: "PURCHASE_HAS_ACTIVE_RECEIPTS" },
      commercialCorrection: { allowed: true },
    });
    const correction = await voidPurchase(context(), {
      ...command("correction"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId,
        reasonCode: "commercial_correction",
        reason: "Sai giá chứng từ, không đảo hàng.",
        evidenceReferences: ["photo://postgres-correction"],
      },
    });
    expect(correction.ok).toBe(true);
    if (!correction.ok) return;
    expect(correction.value.voidRecord?.policyVersionId).toBe(policyVersionId);

    const original = await getPurchase(context(), { workspaceId: ctx.workspaceId, purchaseId });
    expect(original.ok && original.value.voidRecord?.policyVersionId).toBe(policyVersionId);
    const originalSummary = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(originalSummary.ok && originalSummary.value.lines[0]?.received.valueScaled).toBe(20_000);
    const inventory = await getInventoryBalances(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
    });
    expect(inventory.ok && inventory.value[0]?.quantityScaled).toBe(20_000);

    const payable = await getSupplierBalance(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(payable.ok && payable.value?.balance.amountMinor).toBe(0);
  });
});
