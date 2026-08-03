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
  QualityGradeId,
  InventoryReclassificationId,
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
  adjustInventory,
  reclassifyInventory,
  recordPurchaseReceipt,
  reversePurchaseReceipt,
} from "../../../modules/inventory/inventory.handlers.ts";
import {
  getInventoryBalances,
  getInventoryTimeline,
  getReceipt,
  getPurchaseReceivingSummary,
} from "../../../modules/inventory/inventory.queries.ts";
import { createQualityGrade } from "../../../modules/quality/quality.handlers.ts";

describe.skipIf(skipWithoutDatabase())("Goods Truth against Postgres", () => {
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

  it("TC-EVIDENCE-003 — keeps Purchase supply evidence separate from payable and inventory", async () => {
    const secondGradeId = crypto.randomUUID() as QualityGradeId;
    expect(
      (
        await createQualityGrade(context(), {
          ...command("goods-grade-two"),
          payload: {
            qualityGradeId: secondGradeId,
            name: "Loại 2",
            sortOrder: 20,
          },
        })
      ).ok,
    ).toBe(true);
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
        evidenceReferences: ["supply://commitment/001", "photo://purchase/001"],
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

    const receipt = (
      receiptId: PurchaseReceiptId,
      quantity: number,
      label: string,
      qualityGradeId: QualityGradeId,
      qualityGradeName: string,
    ) => ({
      ...command(label),
      payload: {
        receiptId,
        purchaseId,
        lines: [
          {
            receiptLineId: crypto.randomUUID(),
            purchaseLineId,
            productId: ctx.productIds[0],
            qualityGradeId,
            qualityGradeName,
            quantity: { valueScaled: quantity, unit: "kg" as const },
          },
        ],
        note: null,
        evidenceReferences: [`photo://${label}`],
      },
    });
    const receiptACommand = receipt(
      receiptA,
      60_000,
      "goods-receipt-a",
      ctx.qualityGradeId,
      "Loại 1",
    );
    const receiptBCommand = receipt(receiptB, 40_000, "goods-receipt-b", secondGradeId, "Loại 2");
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
    expect(stock.ok && stock.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualityGradeId: ctx.qualityGradeId,
          unit: "kg",
          quantityScaled: 60_000,
          movementCount: 1,
        }),
        expect.objectContaining({
          qualityGradeId: secondGradeId,
          unit: "kg",
          quantityScaled: 40_000,
          movementCount: 1,
        }),
      ]),
    );
    const purchase = await getPurchase(context(), { workspaceId: ctx.workspaceId, purchaseId });
    expect(purchase.ok && purchase.value?.totalAmount.amountMinor).toBe(1_000_000);
    expect(purchase.ok && purchase.value?.evidenceReferences).toEqual([
      "supply://commitment/001",
      "photo://purchase/001",
    ]);
    const storedReceipt = await getReceipt(context(), {
      workspaceId: ctx.workspaceId,
      receiptId: receiptA,
    });
    expect(storedReceipt.ok && storedReceipt.value?.evidenceReferences).toEqual([
      "photo://goods-receipt-a",
    ]);

    const over = await recordPurchaseReceipt(
      context(),
      receipt(
        crypto.randomUUID() as PurchaseReceiptId,
        1_000,
        "goods-over",
        ctx.qualityGradeId,
        "Loại 1",
      ),
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
    const blockedSummary = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(blockedSummary.ok && blockedSummary.value.capabilities.voidPurchase).toMatchObject({
      allowed: false,
      reasonCode: "PURCHASE_HAS_ACTIVE_RECEIPTS",
    });
    expect(
      (await getSupplierBalance(context(), { workspaceId: ctx.workspaceId, supplierId })).ok,
    ).toBe(true);
    const stockBeforeReceiptCorrection = await getInventoryBalances(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
    });
    expect(
      stockBeforeReceiptCorrection.ok &&
        stockBeforeReceiptCorrection.value.reduce((sum, row) => sum + row.quantityScaled, 0),
    ).toBe(100_000);

    // This next reversal is legal only because the Receipt records themselves are
    // being treated as erroneous test facts. It is NOT the generic path for
    // correcting a Purchase after goods were physically accepted (ASM-036).
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
              reason: "Phiếu nhận test được xác định đã ghi nhầm",
            },
          })
        ).ok,
      ).toBe(true);
    }
    const allowedSummary = await getPurchaseReceivingSummary(context(), {
      workspaceId: ctx.workspaceId,
      purchaseId,
    });
    expect(allowedSummary.ok && allowedSummary.value.capabilities.voidPurchase).toEqual({
      allowed: true,
    });
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
    expect(finalStock.ok && finalStock.value.every((row) => row.quantityScaled === 0)).toBe(true);

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
      qualityGradeId: ctx.qualityGradeId,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryTimeline.ok && inventoryTimeline.value.items).toHaveLength(2);

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
    const replacementIds = [
      crypto.randomUUID() as PurchaseId,
      crypto.randomUUID() as PurchaseId,
    ] as const;
    const replacements = await Promise.all(
      replacementIds.map((replacementId, index) =>
        createPurchaseDraft(context(), {
          ...command(`goods-replacement-race-${index}`),
          payload: {
            ...replacementPayload,
            purchaseId: replacementId,
          },
        }),
      ),
    );
    expect(replacements.filter((result) => result.ok)).toHaveLength(1);
    const rejected = replacements.find((result) => !result.ok);
    expect(rejected?.ok).toBe(false);
    if (rejected !== undefined && !rejected.ok)
      expect(rejected.error.code).toBe("PURCHASE_REPLACEMENT_INVALID");

    const replacementEvidence = await ctx.database.sql<
      readonly { purchases: number; audits: number }[]
    >`select
        (select count(*)::int
           from purchases
          where workspace_id = ${ctx.workspaceId}::uuid
            and replaces_purchase_id = ${purchaseId}::uuid) as purchases,
        (select count(*)::int
           from audit_logs a
           join purchases p
             on p.workspace_id = a.workspace_id and p.id = a.aggregate_id
          where p.workspace_id = ${ctx.workspaceId}::uuid
            and p.replaces_purchase_id = ${purchaseId}::uuid
            and a.action = 'purchase.draft_created') as audits`;
    expect(replacementEvidence[0]).toEqual({ purchases: 1, audits: 1 });
  });

  it("atomically accumulates concurrent inventory projection deltas", async () => {
    const effects = [70_000, 30_000] as const;
    const results = await Promise.all(
      effects.map((valueScaled, index) =>
        adjustInventory(context(), {
          ...command(`concurrent-inventory-adjustment-${index}`),
          payload: {
            adjustmentId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled, unit: "thung" as const },
            direction: "increase" as const,
            reasonCode: "count_correction" as const,
            reason: `Kiểm kê đồng thời ${index}`,
          },
        }),
      ),
    );
    expect(results.every((result) => result.ok)).toBe(true);

    const rows = await ctx.database.sql<
      readonly {
        canonical_sum: number;
        canonical_count: number;
        projection_quantity: number;
        projection_count: number;
      }[]
    >`select
        coalesce(sum(m.quantity_scaled), 0)::int as canonical_sum,
        count(m.id)::int as canonical_count,
        b.quantity_scaled::int as projection_quantity,
        b.movement_count::int as projection_count
      from inventory_movements m
      join inventory_balances b
        on b.workspace_id = m.workspace_id
       and b.product_id = m.product_id
       and b.unit = m.unit
      where m.workspace_id = ${ctx.workspaceId}::uuid
        and m.product_id = ${ctx.productIds[0]}::uuid
        and m.unit = 'thung'
      group by b.quantity_scaled, b.movement_count`;
    expect(rows[0]).toEqual({
      canonical_sum: 100_000,
      canonical_count: 2,
      projection_quantity: 100_000,
      projection_count: 2,
    });
  });

  it("deduplicates one inventory adjustment source across command identities", async () => {
    const adjustmentId = crypto.randomUUID();
    const payload = {
      adjustmentId,
      productId: ctx.productIds[0],
      qualityGradeId: ctx.qualityGradeId,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 25_000, unit: "kien" as const },
      direction: "increase" as const,
      reasonCode: "count_correction" as const,
      reason: "Một lần kiểm kê",
    };
    const results = await Promise.all([
      adjustInventory(context(), { ...command("duplicate-adjustment-a"), payload }),
      adjustInventory(context(), { ...command("duplicate-adjustment-b"), payload }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);

    const rows = await ctx.database.sql<
      readonly {
        movement_count: number;
        canonical_sum: number;
        projection_quantity: number;
        projection_count: number;
      }[]
    >`select
        count(m.id)::int as movement_count,
        coalesce(sum(m.quantity_scaled), 0)::int as canonical_sum,
        b.quantity_scaled::int as projection_quantity,
        b.movement_count::int as projection_count
      from inventory_movements m
      join inventory_balances b
        on b.workspace_id = m.workspace_id
       and b.product_id = m.product_id
       and b.unit = m.unit
      where m.workspace_id = ${ctx.workspaceId}::uuid
        and m.source_type = 'inventory_adjustment'
        and m.source_id = ${adjustmentId}::uuid
      group by b.quantity_scaled, b.movement_count`;
    expect(rows[0]).toEqual({
      movement_count: 1,
      canonical_sum: 25_000,
      projection_quantity: 25_000,
      projection_count: 1,
    });
  });

  it("separates grades, conserves reclassification, attributes spoilage, and leaves money alone", async () => {
    const secondGradeId = crypto.randomUUID() as QualityGradeId;
    const createdGrade = await createQualityGrade(context(), {
      ...command("quality-grade-two"),
      payload: {
        qualityGradeId: secondGradeId,
        name: "Dạt",
        sortOrder: 20,
      },
    });
    expect(createdGrade.ok).toBe(true);
    const productId = ctx.productIds[1];
    const debtBefore = await ctx.accountEntryRows();
    expect(
      (
        await adjustInventory(context(), {
          ...command("graded-opening"),
          payload: {
            adjustmentId: crypto.randomUUID(),
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 100_000, unit: "kg" },
            direction: "increase",
            reasonCode: "opening_balance",
            reason: "Tồn đầu theo phẩm cấp",
          },
        })
      ).ok,
    ).toBe(true);
    const reclassification = {
      ...command("graded-reclassification"),
      payload: {
        reclassificationId: crypto.randomUUID() as InventoryReclassificationId,
        productId,
        fromQualityGradeId: ctx.qualityGradeId,
        fromQualityGradeName: "Loại 1",
        toQualityGradeId: secondGradeId,
        toQualityGradeName: "Dạt",
        quantity: { valueScaled: 30_000, unit: "kg" as const },
        reason: "Phân loại lại cuối ngày",
      },
    };
    const first = await reclassifyInventory(context(), reclassification);
    expect(first.ok).toBe(true);
    expect(await reclassifyInventory(context(), reclassification)).toEqual(first);
    expect(
      (
        await adjustInventory(context(), {
          ...command("graded-spoilage"),
          payload: {
            adjustmentId: crypto.randomUUID(),
            productId,
            qualityGradeId: secondGradeId,
            qualityGradeName: "Dạt",
            quantity: { valueScaled: 4_000, unit: "kg" },
            direction: "decrease",
            reasonCode: "spoilage",
            reason: "Dập sau một ngày",
          },
        })
      ).ok,
    ).toBe(true);
    const balances = await getInventoryBalances(context(), {
      workspaceId: ctx.workspaceId,
      productId,
    });
    expect(balances.ok && balances.value).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          qualityGradeId: ctx.qualityGradeId,
          unit: "kg",
          quantityScaled: 70_000,
        }),
        expect.objectContaining({
          qualityGradeId: secondGradeId,
          unit: "kg",
          quantityScaled: 26_000,
        }),
      ]),
    );
    const movements = await deps.uow.transaction((repos) =>
      repos.inventoryMovements.listByProduct(ctx.workspaceId, productId, "kg"),
    );
    expect(movements).toHaveLength(4);
    expect(
      movements
        .filter((movement) => movement.sourceType === "inventory_reclassification")
        .reduce((sum, movement) => sum + movement.quantity.valueScaled, 0),
    ).toBe(0);
    expect(movements.find((movement) => movement.reasonCode === "spoilage")).toMatchObject({
      quantity: { valueScaled: -4_000, unit: "kg" },
      qualityGradeId: secondGradeId,
    });
    expect(await ctx.accountEntryRows()).toEqual(debtBefore);
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
      qualityGradeId: null,
      unit: "bo",
      cursor: null,
      limit: 2,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await getInventoryTimeline(context(), {
      workspaceId: ctx.workspaceId,
      productId: ctx.productIds[0],
      qualityGradeId: null,
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
