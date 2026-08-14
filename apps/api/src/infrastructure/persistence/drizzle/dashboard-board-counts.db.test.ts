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
  PaymentId,
  SaleId,
  SaleLineId,
} from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import {
  getOperationsBoard,
  getOperationsBoardCounts,
} from "../../../modules/dashboard/dashboard.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";

describe.skipIf(skipWithoutDatabase())("Operations Board counts against PostgreSQL", () => {
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
    ctx = await createDbTestContext(`dashboard-board-counts-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-29T12:00:00.000Z" as never },
    };
  });

  afterEach(async () => ctx.close());

  it("TC-OPS-026 — counts overlapping physical and money attention causes once", async () => {
    const productId = ctx.productIds[0];
    const saleId = crypto.randomUUID() as SaleId;
    const saleLineId = crypto.randomUUID() as SaleLineId;
    expect(
      (
        await createSaleDraft(context(), {
          ...envelope("attention-sale", "2026-07-29T02:00:00.000Z"),
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
          ...envelope("attention-post", "2026-07-29T02:01:00.000Z"),
          expectedVersion: 1,
          payload: { saleId },
        })
      ).ok,
    ).toBe(true);

    const corruptDeliveryId = crypto.randomUUID() as DeliveryId;
    const corruptDeliveryLineId = crypto.randomUUID() as DeliveryLineId;
    await ctx.database.sql`
      insert into deliveries (
        id, workspace_id, sale_id, status, note, evidence_references,
        cancellation_reason, version, transaction_time, recorded_at,
        dispatched_at, delivered_at, actor_id
      ) values (
        ${corruptDeliveryId}::uuid, ${ctx.workspaceId}::uuid, ${saleId}::uuid,
        'dispatched', null, ARRAY[]::text[], null, 2,
        '2026-07-29T03:00:00.000Z'::timestamptz,
        '2026-07-29T03:00:00.000Z'::timestamptz,
        '2026-07-29T03:00:00.000Z'::timestamptz, null, ${ctx.actorId}::uuid
      )
    `;
    await ctx.database.sql`
      insert into delivery_lines (
        id, workspace_id, delivery_id, sale_line_id, product_id,
        product_name, quality_grade_id, quality_grade_name, quantity_scaled, unit
      ) values (
        ${corruptDeliveryLineId}::uuid, ${ctx.workspaceId}::uuid,
        ${corruptDeliveryId}::uuid, ${saleLineId}::uuid, ${productId}::uuid,
        'Cà chua', ${ctx.qualityGradeId}::uuid, 'Loại 1', 101000, 'kg'
      )
    `;
    expect(
      (
        await recordCustomerPayment(context(), {
          ...envelope("attention-payment", "2026-07-29T03:01:00.000Z"),
          payload: {
            paymentId: crypto.randomUUID() as PaymentId,
            customerId: ctx.customerId,
            amount: { amountMinor: 100_000, currency: "VND" },
            method: "cash",
            payerName: null,
            note: null,
          },
        })
      ).ok,
    ).toBe(true);

    const board = await getOperationsBoard(context(), {
      workspaceId: ctx.workspaceId,
      filter: "attention",
      sort: "updated_desc",
      search: "",
      cursor: null,
      limit: 20,
    });
    expect(board.ok).toBe(true);
    if (board.ok)
      expect(board.value.page.items).toContainEqual(
        expect.objectContaining({
          id: saleId,
          physicalState: "attention",
          financialState: "reconciliation_required",
          nextAction: "Kiểm tra",
          exceptions: expect.arrayContaining([
            expect.objectContaining({ kind: "unallocated_payment", closeImpact: "blocking" }),
            expect.objectContaining({ kind: "reconciliation_variance", closeImpact: "blocking" }),
          ]),
        }),
      );

    const counts = await getOperationsBoardCounts(context(), {
      workspaceId: ctx.workspaceId,
      filter: "all",
      search: "",
    });
    expect(counts.ok).toBe(true);
    if (counts.ok) {
      expect(counts.value.counts.attention).toBe(1);
      expect(counts.value.counts.unallocatedPayment).toBe(1);
      expect(counts.value.counts.reconciliationVariance).toBe(1);
      expect(counts.value.counts.outstandingDelivery).toBe(0);
      expect(counts.value.counts.exceptionCounts).toMatchObject({
        outstanding_delivery: 0,
        unallocated_payment: 1,
        reconciliation_variance: 1,
      });
    }

    const canonicalFilters = [
      ["unallocated_payment", "unallocatedPayment"],
      ["reconciliation_variance", "reconciliationVariance"],
    ] as const;
    for (const [filter, countKey] of canonicalFilters) {
      const filteredPage = await getOperationsBoard(context(), {
        workspaceId: ctx.workspaceId,
        filter,
        sort: "updated_desc",
        search: "SALE",
        cursor: null,
        limit: 20,
      });
      const filteredCounts = await getOperationsBoardCounts(context(), {
        workspaceId: ctx.workspaceId,
        filter,
        search: "SALE",
      });
      expect(filteredPage.ok).toBe(true);
      expect(filteredCounts.ok).toBe(true);
      if (filteredPage.ok && filteredCounts.ok) {
        expect(filteredPage.value.page.items).toHaveLength(1);
        expect(filteredCounts.value.counts[countKey]).toBe(1);
      }
    }
  });
});
