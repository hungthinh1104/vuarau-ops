import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { ProductId, PurchaseId, PurchaseLineId, SupplierId } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import {
  recordPurchaseReceipt,
  reversePurchaseReceipt,
} from "../../../modules/inventory/inventory.handlers.ts";
import { getInventoryValuation } from "../../../modules/inventory/inventory.queries.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";

describe.skipIf(skipWithoutDatabase())("inventory valuation against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string, occurredAt = "2026-07-20T05:00:00.000Z") => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `valuation-db-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt,
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`valuation-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-20T11:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-VALUATION-003 keeps policy selection, purchase cost and PostgreSQL read parity", async () => {
    const productId = ctx.productIds[0] as ProductId;
    const gradeId = ctx.qualityGradeId;
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    const policyVersionId = crypto.randomUUID();
    const receiptId = crypto.randomUUID();

    expect(
      (
        await createSupplier(context(), {
          ...command("supplier"),
          payload: { supplierId, displayName: "Nhà cung cấp valuation", phone: null, note: null },
        })
      ).ok,
    ).toBe(true);

    const beforePolicy = await getInventoryValuation(context(), {
      workspaceId: ctx.workspaceId,
      productId,
      qualityGradeId: null,
      unit: null,
      asOf: "2026-07-20T05:00:00.000Z",
    });
    expect(beforePolicy.ok && beforePolicy.value.status).toBe("unavailable");

    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("policy-draft"),
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
            reason: "Policy định giá đã được cấu hình.",
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
            evidenceReferences: ["field://valuation/postgres-001"],
            reason: "Đã duyệt policy định giá.",
          },
        })
      ).ok,
    ).toBe(true);

    expect(
      (
        await createPurchaseDraft(context(), {
          ...command("purchase-create"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId,
                productName: "Cà chua valuation",
                quantity: { valueScaled: 1_000, unit: "kg" },
                unitPrice: { amountMinor: 100, currency: "VND" },
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
            receiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID(),
                purchaseLineId,
                productId,
                qualityGradeId: gradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 1_000, unit: "kg" },
              },
            ],
            note: null,
            evidenceReferences: ["photo://valuation-postgres"],
          },
        })
      ).ok,
    ).toBe(true);

    const result = await getInventoryValuation(context(), {
      workspaceId: ctx.workspaceId,
      productId,
      qualityGradeId: gradeId,
      unit: "kg",
      asOf: "2026-07-20T05:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        status: "available",
        policyVersionId,
        rows: [{ quantityScaled: 1_000, inventoryValue: { amountMinor: 100, currency: "VND" } }],
      });
    }

    const reversed = await reversePurchaseReceipt(context(), {
      ...command("receipt-reverse", "2026-07-20T06:00:00.000Z"),
      payload: {
        reversalId: crypto.randomUUID(),
        receiptId,
        reasonCode: "other",
        reason: "Huỷ receipt để kiểm tra lineage.",
        evidenceReferences: ["photo://valuation-reversal"],
      },
    });
    expect(reversed.ok).toBe(true);

    const afterReversal = await getInventoryValuation(context(), {
      workspaceId: ctx.workspaceId,
      productId,
      qualityGradeId: gradeId,
      unit: "kg",
      asOf: "2026-07-21T00:00:00.000Z",
    });
    expect(afterReversal.ok).toBe(true);
    if (afterReversal.ok) {
      expect(afterReversal.value).toMatchObject({
        status: "available",
        rows: [{ quantityScaled: 0, inventoryValue: null, cogs: null }],
      });
    }
  });
});
