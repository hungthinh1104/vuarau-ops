import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  SupplierId,
  SupplierPaymentId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  createSupplier,
  recordSupplierPayment,
} from "../../../modules/supplier/supplier.handlers.ts";
import {
  getSupplierBalance,
  getSupplierTimeline,
} from "../../../modules/supplier/supplier.queries.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  voidPurchase,
} from "../../../modules/purchase/purchase.handlers.ts";
import { getPurchase } from "../../../modules/purchase/purchase.queries.ts";
import {
  recordPurchaseReceipt,
  reversePurchaseReceipt,
} from "../../../modules/inventory/inventory.handlers.ts";
import {
  getInventoryBalances,
  getInventoryTimeline,
} from "../../../modules/inventory/inventory.queries.ts";

describe.skipIf(skipWithoutDatabase())("M16-M18 Goods Truth against Postgres", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const supplierId = crypto.randomUUID() as SupplierId;
  const purchaseId = crypto.randomUUID() as PurchaseId;
  const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
  const paymentId = crypto.randomUUID() as SupplierPaymentId;
  const receiptA = crypto.randomUUID() as PurchaseReceiptId;
  const receiptB = crypto.randomUUID() as PurchaseReceiptId;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: new Date().toISOString(),
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("goods-truth");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => new Date().toISOString() as ReturnType<CommandDeps["clock"]["now"]> },
    };
  });
  afterAll(async () => ctx?.close());

  it("keeps payable and physical truth separate, attributable, and duplicate-safe", async () => {
    expect(
      (
        await createSupplier(context(), {
          ...command("goods-supplier"),
          payload: { supplierId, displayName: "Vựa nguồn A", phone: null, note: null },
        })
      ).ok,
    ).toBe(true);

    const draft = await createPurchaseDraft(context(), {
      ...command("goods-purchase"),
      payload: {
        purchaseId,
        supplierId,
        currency: "VND",
        lines: [
          {
            lineId: purchaseLineId,
            productId: ctx.productIds[0],
            productName: "Cà chua snapshot",
            quantity: { valueScaled: 100_000, unit: "kg" },
            unitPrice: { amountMinor: 10_000, currency: "VND" },
          },
        ],
        note: null,
        dueAt: null,
        replacesPurchaseId: null,
      },
    });
    expect(draft.ok).toBe(true);
    expect(
      (
        await getSupplierBalance(context(), {
          workspaceId: ctx.workspaceId,
          supplierId,
        })
      ).ok,
    ).toBe(true);

    const confirm = {
      ...command("goods-confirm"),
      expectedVersion: 1,
      payload: { purchaseId },
    };
    expect((await confirmPurchase(context(), confirm)).ok).toBe(true);
    expect((await confirmPurchase(context(), confirm)).ok).toBe(true);

    expect(
      (
        await recordSupplierPayment(context(), {
          ...command("goods-payment"),
          payload: {
            supplierPaymentId: paymentId,
            supplierId,
            amount: { amountMinor: 400_000, currency: "VND" },
            method: "cash",
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const receipt = (receiptId: PurchaseReceiptId, quantity: number, label: string) => ({
      ...command(label),
      payload: {
        receiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: crypto.randomUUID(),
            purchaseLineId,
            productId: ctx.productIds[0],
            quantity: { valueScaled: quantity, unit: "kg" as const },
          },
        ],
        note: null,
      },
    });
    const receiptACommand = receipt(receiptA, 60_000, "goods-receipt-a");
    const receiptBCommand = receipt(receiptB, 40_000, "goods-receipt-b");
    expect((await recordPurchaseReceipt(context(), receiptACommand)).ok).toBe(true);
    expect((await recordPurchaseReceipt(context(), receiptBCommand)).ok).toBe(true);
    expect((await recordPurchaseReceipt(context(), receiptBCommand)).ok).toBe(true);

    const payable = await getSupplierBalance(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(payable.ok && payable.value?.balance.amountMinor).toBe(600_000);
    const stock = await getInventoryBalances(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
    });
    expect(stock.ok && stock.value).toContainEqual(
      expect.objectContaining({
        unit: "kg",
        quantityScaled: 100_000,
        movementCount: 2,
      }),
    );
    const purchase = await getPurchase(context(), { workspaceId: ctx.workspaceId, purchaseId });
    expect(purchase.ok && purchase.value?.totalAmount.amountMinor).toBe(1_000_000);

    const over = await recordPurchaseReceipt(
      context(),
      receipt(crypto.randomUUID() as PurchaseReceiptId, 1_000, "goods-over"),
    );
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error.code).toBe("RECEIPT_QUANTITY_EXCEEDS_PURCHASE");
    const blockedVoid = await voidPurchase(context(), {
      ...command("goods-void-blocked"),
      payload: {
        purchaseVoidId: crypto.randomUUID(),
        purchaseId,
        reasonCode: "other",
        reason: "Không nhận hàng",
      },
    });
    expect(blockedVoid.ok).toBe(false);
    if (!blockedVoid.ok) expect(blockedVoid.error.code).toBe("PURCHASE_HAS_ACTIVE_RECEIPTS");

    for (const [receiptId, label] of [
      [receiptB, "b"],
      [receiptA, "a"],
    ] as const) {
      expect(
        (
          await reversePurchaseReceipt(context(), {
            ...command(`goods-reverse-${label}`),
            payload: {
              reversalId: crypto.randomUUID(),
              receiptId,
              reasonCode: "wrong_quantity",
              reason: "Hoàn tác để sửa đơn mua",
            },
          })
        ).ok,
      ).toBe(true);
    }
    expect(
      (
        await voidPurchase(context(), {
          ...command("goods-void"),
          payload: {
            purchaseVoidId: crypto.randomUUID(),
            purchaseId,
            reasonCode: "other",
            reason: "Hủy giao dịch",
          },
        })
      ).ok,
    ).toBe(true);

    const finalPayable = await getSupplierBalance(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
    });
    expect(finalPayable.ok && finalPayable.value?.balance.amountMinor).toBe(-400_000);
    const finalStock = await getInventoryBalances(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
    });
    expect(finalStock.ok && finalStock.value[0]?.quantityScaled).toBe(0);

    const supplierTimeline = await getSupplierTimeline(context(), {
      workspaceId: ctx.workspaceId,
      supplierId,
      cursor: null,
      limit: 20,
    });
    expect(supplierTimeline.ok && supplierTimeline.value.items).toHaveLength(3);
    const inventoryTimeline = await getInventoryTimeline(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryTimeline.ok && inventoryTimeline.value.items).toHaveLength(4);

    const counts = await ctx.database.sql<
      readonly {
        purchases: number;
        supplier_entries: number;
        movements: number;
      }[]
    >`select
      (select count(*)::int from purchases where workspace_id = ${ctx.workspaceId}::uuid) purchases,
      (select count(*)::int from supplier_account_entries where workspace_id = ${ctx.workspaceId}::uuid) supplier_entries,
      (select count(*)::int from inventory_movements where workspace_id = ${ctx.workspaceId}::uuid) movements`;
    expect(counts[0]).toEqual({ purchases: 1, supplier_entries: 3, movements: 4 });

    const replacementPayload = {
      supplierId,
      currency: "VND" as const,
      lines: [
        {
          lineId: crypto.randomUUID() as PurchaseLineId,
          productId: ctx.productIds[0],
          productName: "Cà chua thay thế",
          quantity: { valueScaled: 100_000, unit: "kg" as const },
          unitPrice: { amountMinor: 10_000, currency: "VND" as const },
        },
      ],
      note: "Thay đơn đã hoàn tác",
      dueAt: null,
      replacesPurchaseId: purchaseId,
    };
    const replacement = await createPurchaseDraft(context(), {
      ...command("goods-replacement"),
      payload: {
        ...replacementPayload,
        purchaseId: crypto.randomUUID() as PurchaseId,
      },
    });
    expect(replacement.ok).toBe(true);
    const secondReplacement = await createPurchaseDraft(context(), {
      ...command("goods-second-replacement"),
      payload: {
        ...replacementPayload,
        purchaseId: crypto.randomUUID() as PurchaseId,
      },
    });
    expect(secondReplacement.ok).toBe(false);
    if (!secondReplacement.ok)
      expect(secondReplacement.error.code).toBe("PURCHASE_REPLACEMENT_INVALID");
  });

  it("uses the full inventory order at equal timestamps across cursor boundaries", async () => {
    const ids = Array.from({ length: 3 }, () => crypto.randomUUID());
    const at = "2026-07-29T04:00:00.000Z";
    for (const [index, id] of ids.entries()) {
      const commandId = crypto.randomUUID();
      await ctx.database.sql`
        insert into command_receipts
          (command_id, workspace_id, idempotency_key, command_type, payload_hash, status,
           result, recorded_at)
        values (
          ${commandId}::uuid, ${ctx.workspaceId}::uuid, ${`inventory-order-${index}`},
          'TestInventoryOrder', ${`hash-${index}`}, 'completed', '{}'::jsonb, ${at}::timestamptz
        )
      `;
      await ctx.database.sql`
        insert into inventory_movements
          (id, workspace_id, product_id, quantity_scaled, unit, source_type, source_id,
           reason_code, reason, transaction_time, recorded_at, actor_id, command_id)
        values (
          ${id}::uuid, ${ctx.workspaceId}::uuid, ${ctx.productIds[0]}::uuid,
          ${index + 1}, 'bo', 'inventory_adjustment', ${crypto.randomUUID()}::uuid,
          'count_correction', 'Cùng timestamp', ${at}::timestamptz, ${at}::timestamptz,
          ${ctx.actorId}::uuid, ${commandId}::uuid
        )
      `;
    }
    const first = await getInventoryTimeline(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      unit: "bo",
      cursor: null,
      limit: 2,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await getInventoryTimeline(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      unit: "bo",
      cursor: first.value.nextCursor,
      limit: 2,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const seen = [...first.value.items, ...second.value.items].map((movement) => movement.id);
    expect(seen).toEqual([...ids].sort().reverse());
    expect(new Set(seen).size).toBe(3);
  });

  it("rejects crafted cross-workspace Goods Truth references structurally", async () => {
    await expect(ctx.database.sql`
      insert into purchases
        (id, workspace_id, supplier_id, status, currency, total_amount_minor,
         version, transaction_time, recorded_at)
      values (
        ${crypto.randomUUID()}::uuid, ${ctx.foreignWorkspaceId}::uuid, ${supplierId}::uuid,
        'draft', 'VND', 0, 1, now(), now()
      )
    `).rejects.toThrow();
  });
});
