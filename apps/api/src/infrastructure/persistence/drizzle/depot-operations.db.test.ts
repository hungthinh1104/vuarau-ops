import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type {
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  DocumentId,
  DocumentShareId,
  PurchaseId,
  PurchaseLineId,
  PurchaseReceiptId,
  PurchaseReceiptLineId,
  SaleId,
  SaleLineId,
  SupplierId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createSupplier } from "../../../modules/supplier/supplier.handlers.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
} from "../../../modules/purchase/purchase.handlers.ts";
import { recordPurchaseReceipt } from "../../../modules/inventory/inventory.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import {
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
  updateDeliveryDraft,
} from "../../../modules/delivery/delivery.handlers.ts";
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import { getDelivery, getSaleFulfilment } from "../../../modules/delivery/delivery.queries.ts";
import {
  createDocumentShare,
  generateDocument,
  revokeDocumentShare,
} from "../../../modules/document/document.handlers.ts";
import { getDocument } from "../../../modules/document/document.queries.ts";
import {
  getOperationalReport,
  getOperationalReportCsv,
} from "../../../modules/report/report.queries.ts";
import { exportWorkspaceBackup } from "../../../modules/operations/operations.queries.ts";

// TC-DELIVERY-003, TC-DOCUMENT-002, TC-REPORT-001
describe.skipIf(skipWithoutDatabase())("Depot operations against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const envelope = (label: string, occurredAt: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt,
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`depot-operations-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
    };
  });
  afterEach(async () => ctx.close());

  it("proves receive 100, dispatch 60+40, retry, return 10, documents, reports and backup", async () => {
    const productId = ctx.productIds[0];
    const supplierId = crypto.randomUUID() as SupplierId;
    const purchaseId = crypto.randomUUID() as PurchaseId;
    const purchaseLineId = crypto.randomUUID() as PurchaseLineId;
    expect(
      (
        await createSupplier(context(), {
          ...envelope("supplier", "2026-07-29T01:00:00.000Z"),
          payload: {
            supplierId,
            displayName: "Nhà vườn M19",
            phone: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await createPurchaseDraft(context(), {
          ...envelope("purchase", "2026-07-29T01:01:00.000Z"),
          payload: {
            purchaseId,
            supplierId,
            currency: "VND",
            lines: [
              {
                lineId: purchaseLineId,
                productId,
                productName: "Cà chua",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 10_000, currency: "VND" },
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
        await confirmPurchase(context(), {
          ...envelope("confirm", "2026-07-29T01:02:00.000Z"),
          expectedVersion: 1,
          payload: { purchaseId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await recordPurchaseReceipt(context(), {
          ...envelope("receive", "2026-07-29T01:03:00.000Z"),
          payload: {
            receiptId: crypto.randomUUID() as PurchaseReceiptId,
            purchaseId,
            lines: [
              {
                receiptLineId: crypto.randomUUID() as PurchaseReceiptLineId,
                purchaseLineId,
                productId,
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
              },
            ],
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    expect(
      (
        await createSaleDraft(context(), {
          ...envelope("sale", "2026-07-29T02:00:00.000Z"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId,
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...envelope("post", "2026-07-29T02:01:00.000Z"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);
    const debtBeforeDelivery = await ctx.accountEntryRows();

    const deliveries = [
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 60_000,
      },
      {
        id: crypto.randomUUID() as DeliveryId,
        lineId: crypto.randomUUID() as DeliveryLineId,
        quantity: 40_000,
      },
    ];
    for (const [index, delivery] of deliveries.entries()) {
      expect(
        (
          await createDeliveryDraft(context(), {
            ...envelope(`delivery-${index}`, `2026-07-29T03:0${index}:00.000Z`),
            payload: {
              deliveryId: delivery.id,
              saleId,
              lines: [
                {
                  deliveryLineId: delivery.lineId,
                  saleLineId,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  quantity: { valueScaled: delivery.quantity, unit: "kg" },
                },
              ],
              note: null,
              evidenceReferences:
                index === 0 ? ["dispatch-sheet://delivery/001", "photo://loading/001"] : [],
            },
          })
        ).ok,
      ).toBe(true);
      const dispatchInput = {
        ...envelope(`dispatch-${index}`, `2026-07-29T04:0${index}:00.000Z`),
        expectedVersion: 1,
        payload: { deliveryId: delivery.id },
      };
      const dispatched = await dispatchDelivery(context(), dispatchInput);
      expect(dispatched.ok).toBe(true);
      if (index === 1) expect(await dispatchDelivery(context(), dispatchInput)).toEqual(dispatched);
      expect(
        (
          await markDeliveryDelivered(context(), {
            ...envelope(`delivered-${index}`, `2026-07-29T05:0${index}:00.000Z`),
            expectedVersion: 2,
            payload: { deliveryId: delivery.id },
          })
        ).ok,
      ).toBe(true);
    }
    expect(
      (
        await recordDeliveryReturn(context(), {
          ...envelope("return", "2026-07-29T06:00:00.000Z"),
          payload: {
            returnId: crypto.randomUUID() as DeliveryReturnId,
            deliveryId: deliveries[0]!.id,
            lines: [
              {
                deliveryLineId: deliveries[0]!.lineId,
                quantity: { valueScaled: 10_000, unit: "kg" },
              },
            ],
            reason: "Khách trả 10 kg",
            evidenceReferences: ["photo://return/001"],
          },
        })
      ).ok,
    ).toBe(true);

    const deliveryRead = await getDelivery(context(), {
      workspaceId: ctx.workspaceId,
      deliveryId: deliveries[0]!.id,
    });
    expect(deliveryRead.ok && deliveryRead.value.evidenceReferences).toEqual([
      "dispatch-sheet://delivery/001",
      "photo://loading/001",
    ]);
    expect(deliveryRead.ok && deliveryRead.value.returns[0]?.evidenceReferences).toEqual([
      "photo://return/001",
    ]);

    const movements = await deps.uow.transaction((repos) =>
      repos.inventoryMovements.listByProduct(ctx.workspaceId, productId, "kg"),
    );
    expect(movements.reduce((sum, movement) => sum + movement.quantity.valueScaled, 0)).toBe(
      10_000,
    );
    expect(movements.filter((row) => row.sourceType === "delivery_dispatch")).toHaveLength(2);
    expect(movements.filter((row) => row.sourceType === "delivery_return")).toHaveLength(1);
    expect(await ctx.accountEntryRows()).toEqual(debtBeforeDelivery);
    const fulfilment = await getSaleFulfilment(context(), {
      workspaceId: ctx.workspaceId,
      saleId,
    });
    expect(fulfilment.ok && fulfilment.value.lines[0]?.remaining.valueScaled).toBe(10_000);

    const saleDocument = await generateDocument(context(), {
      ...envelope("sale-document", "2026-07-29T07:00:00.000Z"),
      payload: {
        documentId: crypto.randomUUID() as DocumentId,
        documentType: "sale_receipt",
        sourceType: "sale",
        sourceId: saleId,
      },
    });
    const deliveryDocument = await generateDocument(context(), {
      ...envelope("delivery-document", "2026-07-29T07:01:00.000Z"),
      payload: {
        documentId: crypto.randomUUID() as DocumentId,
        documentType: "delivery_note",
        sourceType: "delivery",
        sourceId: deliveries[0]!.id,
      },
    });
    expect(saleDocument.ok && deliveryDocument.ok).toBe(true);
    if (!saleDocument.ok) return;
    const shareId = crypto.randomUUID() as DocumentShareId;
    const shared = await createDocumentShare(context(), {
      ...envelope("share", "2026-07-29T07:02:00.000Z"),
      payload: { shareId, documentId: saleDocument.value.id, expiresAt: null },
    });
    expect(shared.ok).toBe(true);
    expect(
      (
        await revokeDocumentShare(context(), {
          ...envelope("revoke-share", "2026-07-29T07:03:00.000Z"),
          payload: { shareId, reason: "Đóng chia sẻ" },
        })
      ).ok,
    ).toBe(true);
    const regenerated = await Promise.all(
      [0, 1].map((index) =>
        generateDocument(context(), {
          ...envelope(`regenerate-${index}`, "2026-07-29T07:04:00.000Z"),
          payload: {
            documentId: crypto.randomUUID() as DocumentId,
            documentType: "sale_receipt",
            sourceType: "sale",
            sourceId: saleId,
          },
        }),
      ),
    );
    expect(
      regenerated.flatMap((result) => (result.ok ? [result.value.version] : [])).sort(),
    ).toEqual([2, 3]);

    const inventoryReport = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_by_product_unit",
      businessDate: null,
      productId,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inventoryReport.ok && inventoryReport.value.totals.quantities).toEqual([
      { unit: "kg", valueScaled: 10_000 },
    ]);
    const daily = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "customer_account_activity",
      businessDate: "2026-07-29",
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(daily.ok && daily.value.totals.amount?.amountMinor).toBe(2_000_000);
    if (daily.ok)
      expect(daily.value.page.items.every((row) => row.documentHref !== null)).toBe(true);
    const movementPageOne = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_movement_report",
      businessDate: null,
      productId,
      unit: "kg",
      cursor: null,
      limit: 2,
    });
    expect(movementPageOne.ok && movementPageOne.value.page.nextCursor).not.toBeNull();
    if (!movementPageOne.ok || movementPageOne.value.page.nextCursor === null) return;
    const movementPageTwo = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_movement_report",
      businessDate: null,
      productId,
      unit: "kg",
      cursor: movementPageOne.value.page.nextCursor,
      limit: 2,
    });
    expect(movementPageTwo.ok).toBe(true);
    if (movementPageTwo.ok) {
      const ids = [...movementPageOne.value.page.items, ...movementPageTwo.value.page.items].map(
        (row) => row.id,
      );
      expect(ids).toHaveLength(4);
      expect(new Set(ids).size).toBe(4);
    }
    const outstanding = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "outstanding_delivery",
      businessDate: null,
      productId: null,
      unit: null,
      cursor: null,
      limit: 20,
    });
    expect(outstanding.ok && outstanding.value.page.items[0]?.quantity?.valueScaled).toBe(10_000);
    const backup = await exportWorkspaceBackup(context(), {
      ...envelope("backup", "2026-07-29T08:00:00.000Z"),
      payload: {},
    });
    expect(backup.ok && backup.value).toMatchObject({
      version: 15,
      schemaCompatibility: "m31-demand-observation",
    });
    if (backup.ok) {
      expect(backup.value.payload.deliveries).toHaveLength(2);
      expect(backup.value.payload.deliveryReturns).toHaveLength(1);
      expect(backup.value.payload.documents).toHaveLength(4);
      expect(backup.value.payload.documentShares).toHaveLength(1);
    }
    await ctx.database.sql`
      update inventory_balances
      set quantity_scaled = quantity_scaled + 1
      where workspace_id = ${ctx.workspaceId}::uuid
        and product_id = ${productId}::uuid and unit = 'kg'
    `;
    const inconsistentReport = await getOperationalReport(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_by_product_unit",
      businessDate: null,
      productId,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(inconsistentReport.ok && inconsistentReport.value).toMatchObject({
      integrity: "attention",
      diagnostics: ["workspace_integrity_attention", "report_projection_unavailable"],
      totals: { amount: null, quantities: [] },
      page: { items: [], nextCursor: null },
    });
    const blockedCsv = await getOperationalReportCsv(context(), {
      workspaceId: ctx.workspaceId,
      reportType: "inventory_by_product_unit",
      businessDate: null,
      productId,
      unit: "kg",
      cursor: null,
      limit: 20,
    });
    expect(blockedCsv.ok).toBe(true);
    if (blockedCsv.ok) expect(blockedCsv.value.split("\n")).toHaveLength(1);
  });

  it("serializes competing dispatches so physical fulfilment cannot exceed the Sale", async () => {
    const productId = ctx.productIds[0];
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    expect(
      (
        await createSaleDraft(context(), {
          ...envelope("race-sale", "2026-07-29T02:00:00.000Z"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId,
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...envelope("race-post", "2026-07-29T02:01:00.000Z"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);
    const candidates = [0, 1].map(() => ({
      id: crypto.randomUUID() as DeliveryId,
      lineId: crypto.randomUUID() as DeliveryLineId,
    }));
    for (const candidate of candidates)
      expect(
        (
          await createDeliveryDraft(context(), {
            ...envelope("race-draft", "2026-07-29T03:00:00.000Z"),
            payload: {
              deliveryId: candidate.id,
              saleId,
              lines: [
                {
                  deliveryLineId: candidate.lineId,
                  saleLineId,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  quantity: { valueScaled: 60_000, unit: "kg" },
                },
              ],
              note: null,
            },
          })
        ).ok,
      ).toBe(true);
    const results = await Promise.all(
      candidates.map((candidate) =>
        dispatchDelivery(context(), {
          ...envelope("race-dispatch", "2026-07-29T04:00:00.000Z"),
          expectedVersion: 1,
          payload: { deliveryId: candidate.id },
        }),
      ),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(
      results.filter(
        (result) => !result.ok && result.error.code === "DELIVERY_QUANTITY_EXCEEDS_SALE",
      ),
    ).toHaveLength(1);
    const movements = await deps.uow.transaction((repos) =>
      repos.inventoryMovements.listByProduct(ctx.workspaceId, productId, "kg"),
    );
    expect(movements.filter((row) => row.sourceType === "delivery_dispatch")).toHaveLength(1);
  });

  it("blocks new physical work after Sale void but preserves explicit returns", async () => {
    const productId = ctx.productIds[0];
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    expect(
      (
        await createSaleDraft(context(), {
          ...envelope("void-sale", "2026-07-29T02:00:00.000Z"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId,
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 100_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...envelope("void-post", "2026-07-29T02:01:00.000Z"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    const dispatchedId = crypto.randomUUID() as DeliveryId;
    const dispatchedLineId = crypto.randomUUID() as DeliveryLineId;
    const draftId = crypto.randomUUID() as DeliveryId;
    const draftLineId = crypto.randomUUID() as DeliveryLineId;
    for (const [id, lineId] of [
      [dispatchedId, dispatchedLineId],
      [draftId, draftLineId],
    ] as const)
      expect(
        (
          await createDeliveryDraft(context(), {
            ...envelope("void-delivery", "2026-07-29T03:00:00.000Z"),
            payload: {
              deliveryId: id,
              saleId,
              lines: [
                {
                  deliveryLineId: lineId,
                  saleLineId,
                  productId,
                  qualityGradeId: ctx.qualityGradeId,
                  quantity: { valueScaled: 20_000, unit: "kg" },
                },
              ],
              note: null,
            },
          })
        ).ok,
      ).toBe(true);
    expect(
      (
        await dispatchDelivery(context(), {
          ...envelope("void-dispatch-before", "2026-07-29T03:01:00.000Z"),
          expectedVersion: 1,
          payload: { deliveryId: dispatchedId },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await voidSale(context(), {
          ...envelope("void-sale-command", "2026-07-29T04:00:00.000Z"),
          payload: {
            saleVoidId: crypto.randomUUID(),
            saleId,
            reasonCode: "wrong_customer",
            reason: "Sale đã huỷ sau khi một chuyến rời kho",
          },
        })
      ).ok,
    ).toBe(true);

    const createAfterVoid = await createDeliveryDraft(context(), {
      ...envelope("create-after-void", "2026-07-29T04:01:00.000Z"),
      payload: {
        deliveryId: crypto.randomUUID() as DeliveryId,
        saleId,
        lines: [
          {
            deliveryLineId: crypto.randomUUID() as DeliveryLineId,
            saleLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: null,
      },
    });
    const updateAfterVoid = await updateDeliveryDraft(context(), {
      ...envelope("update-after-void", "2026-07-29T04:02:00.000Z"),
      expectedVersion: 1,
      payload: {
        deliveryId: draftId,
        lines: [
          {
            deliveryLineId: draftLineId,
            saleLineId,
            productId,
            qualityGradeId: ctx.qualityGradeId,
            quantity: { valueScaled: 10_000, unit: "kg" },
          },
        ],
        note: "Không được ghi",
      },
    });
    const dispatchAfterVoid = await dispatchDelivery(context(), {
      ...envelope("dispatch-after-void", "2026-07-29T04:03:00.000Z"),
      expectedVersion: 1,
      payload: { deliveryId: draftId },
    });
    for (const result of [createAfterVoid, updateAfterVoid, dispatchAfterVoid]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("SALE_ALREADY_VOIDED");
    }

    const returned = await recordDeliveryReturn(context(), {
      ...envelope("return-after-void", "2026-07-29T05:00:00.000Z"),
      payload: {
        returnId: crypto.randomUUID() as DeliveryReturnId,
        deliveryId: dispatchedId,
        lines: [
          {
            deliveryLineId: dispatchedLineId,
            quantity: { valueScaled: 5_000, unit: "kg" },
          },
        ],
        reason: "Hàng quay lại sau khi Sale bị huỷ",
      },
    });
    expect(returned.ok).toBe(true);
  });

  it("keeps documents append-only and refuses a corrupted authenticated snapshot", async () => {
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    expect(
      (
        await createSaleDraft(context(), {
          ...envelope("document-sale", "2026-07-29T02:00:00.000Z"),
          payload: {
            saleId,
            customerId: ctx.customerId,
            currency: "VND",
            lines: [
              {
                lineId: saleLineId,
                productId: ctx.productIds[0],
                productName: "Cà chua",
                qualityGradeId: ctx.qualityGradeId,
                qualityGradeName: "Loại 1",
                quantity: { valueScaled: 1_000, unit: "kg" },
                unitPrice: { amountMinor: 20_000, currency: "VND" },
              },
            ],
            note: null,
            dueAt: null,
            replacesSaleId: null,
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await postSale(context(), {
          ...envelope("document-post", "2026-07-29T02:01:00.000Z"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);
    const generated = await generateDocument(context(), {
      ...envelope("append-only-document", "2026-07-29T03:00:00.000Z"),
      payload: {
        documentId: crypto.randomUUID() as DocumentId,
        documentType: "sale_receipt",
        sourceType: "sale",
        sourceId: saleId,
      },
    });
    expect(generated.ok).toBe(true);
    if (!generated.ok) return;
    await expect(
      ctx.database.sql`
        update documents set digest = repeat('0', 64)
        where id = ${generated.value.id}::uuid
      `,
    ).rejects.toThrow(/append-only/i);
    await expect(
      ctx.database.sql`delete from documents where id = ${generated.value.id}::uuid`,
    ).rejects.toThrow(/append-only/i);

    const corruptedId = crypto.randomUUID() as DocumentId;
    await ctx.database.sql`
      insert into documents (
        id, workspace_id, document_type, source_type, source_id, version,
        snapshot, digest, generated_at, generated_by
      ) values (
        ${corruptedId}::uuid, ${ctx.workspaceId}::uuid, 'sale_receipt', 'sale',
        ${saleId}::uuid, 99, '{"tampered":true}'::jsonb, repeat('0', 64),
        now(), ${ctx.actorId}::uuid
      )
    `;
    const read = await getDocument(context(), {
      workspaceId: ctx.workspaceId,
      documentId: corruptedId,
    });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe("DOCUMENT_SOURCE_INVALID");
  });
});
