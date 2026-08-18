import { and, eq, sql } from "drizzle-orm";
import type { SaleId, WorkspaceId, DeliveryId } from "@vuarau/domain-contracts";
import type {
  DeliveryState,
  DeliveryReturnState,
  SaleLineFulfilmentFacts,
} from "@vuarau/domain-kernel";
import {
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
} from "../../schema/index.ts";
import { fromIso, fromIsoOrNull } from "../row-mappers.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import { loadDelivery } from "../shared/write-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createDeliveryWriteRepositories = (tx: Tx) => ({
  deliveries: {
    findById: (workspaceId: WorkspaceId, deliveryId: DeliveryId) =>
      loadDelivery(tx, workspaceId, deliveryId),
    async findByIdForUpdate(workspaceId: WorkspaceId, deliveryId: DeliveryId) {
      await tx
        .select({ id: deliveries.id })
        .from(deliveries)
        .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
        .limit(1)
        .for("update");
      return loadDelivery(tx, workspaceId, deliveryId);
    },
    async insert(delivery: DeliveryState) {
      const inserted = await tx
        .insert(deliveries)
        .values({
          id: delivery.id,
          workspaceId: delivery.workspaceId,
          saleId: delivery.saleId,
          status: delivery.status,
          note: delivery.note,
          evidenceReferences: [...delivery.evidenceReferences],
          cancellationReason: delivery.cancellationReason,
          version: delivery.version,
          transactionTime: fromIso(delivery.transactionTime),
          recordedAt: fromIso(delivery.recordedAt),
          dispatchedAt: fromIsoOrNull(delivery.dispatchedAt),
          deliveredAt: fromIsoOrNull(delivery.deliveredAt),
          actorId: delivery.actorId,
        })
        .onConflictDoNothing()
        .returning({ id: deliveries.id });
      if (inserted.length === 0) return false;
      await tx.insert(deliveryLines).values(
        delivery.lines.map((line) => ({
          id: line.deliveryLineId,
          workspaceId: delivery.workspaceId,
          deliveryId: delivery.id,
          saleLineId: line.saleLineId,
          productId: line.productId,
          productName: line.productName,
          qualityGradeId: line.qualityGradeId,
          qualityGradeName: line.qualityGradeName,
          quantityScaled: line.quantity.valueScaled,
          unit: line.quantity.unit,
        })),
      );
      return true;
    },
    async update(delivery: DeliveryState, expectedVersion: number, replaceLines: boolean) {
      const changed = await tx
        .update(deliveries)
        .set({
          status: delivery.status,
          note: delivery.note,
          evidenceReferences: [...delivery.evidenceReferences],
          cancellationReason: delivery.cancellationReason,
          version: delivery.version,
          recordedAt: fromIso(delivery.recordedAt),
          dispatchedAt: fromIsoOrNull(delivery.dispatchedAt),
          deliveredAt: fromIsoOrNull(delivery.deliveredAt),
        })
        .where(
          and(
            eq(deliveries.workspaceId, delivery.workspaceId),
            eq(deliveries.id, delivery.id),
            eq(deliveries.version, expectedVersion),
          ),
        )
        .returning({ id: deliveries.id });
      if (changed.length === 0) return false;
      if (replaceLines) {
        await tx
          .delete(deliveryLines)
          .where(
            and(
              eq(deliveryLines.workspaceId, delivery.workspaceId),
              eq(deliveryLines.deliveryId, delivery.id),
            ),
          );
        await tx.insert(deliveryLines).values(
          delivery.lines.map((line) => ({
            id: line.deliveryLineId,
            workspaceId: delivery.workspaceId,
            deliveryId: delivery.id,
            saleLineId: line.saleLineId,
            productId: line.productId,
            productName: line.productName,
            qualityGradeId: line.qualityGradeId,
            qualityGradeName: line.qualityGradeName,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
          })),
        );
      }
      return true;
    },
    async insertReturn(record: DeliveryReturnState) {
      const inserted = await tx
        .insert(deliveryReturns)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          deliveryId: record.deliveryId,
          reason: record.reason,
          evidenceReferences: [...record.evidenceReferences],
          transactionTime: fromIso(record.transactionTime),
          recordedAt: fromIso(record.recordedAt),
          actorId: record.actorId,
        })
        .onConflictDoNothing()
        .returning({ id: deliveryReturns.id });
      if (inserted.length === 0) return false;
      await tx.insert(deliveryReturnLines).values(
        record.lines.map((line) => ({
          workspaceId: record.workspaceId,
          returnId: record.id,
          deliveryLineId: line.deliveryLineId,
          quantityScaled: line.quantity.valueScaled,
          unit: line.quantity.unit,
        })),
      );
      return true;
    },
    async findReturnByIdForUpdate(workspaceId: WorkspaceId, returnId: string) {
      const rows = await tx
        .select()
        .from(deliveryReturns)
        .where(and(eq(deliveryReturns.workspaceId, workspaceId), eq(deliveryReturns.id, returnId)))
        .limit(1)
        .for("update");
      if (rows[0] === undefined) return null;
      const lineRows = await tx
        .select()
        .from(deliveryReturnLines)
        .where(
          and(
            eq(deliveryReturnLines.workspaceId, workspaceId),
            eq(deliveryReturnLines.returnId, returnId),
          ),
        );
      return {
        id: rows[0].id as DeliveryReturnState["id"],
        workspaceId: rows[0].workspaceId as DeliveryReturnState["workspaceId"],
        deliveryId: rows[0].deliveryId as DeliveryReturnState["deliveryId"],
        reason: rows[0].reason,
        evidenceReferences: [...rows[0].evidenceReferences],
        transactionTime: rows[0].transactionTime.toISOString(),
        recordedAt: rows[0].recordedAt.toISOString(),
        actorId: rows[0].actorId as DeliveryReturnState["actorId"],
        lines: lineRows.map((line) => ({
          deliveryLineId:
            line.deliveryLineId as DeliveryReturnState["lines"][number]["deliveryLineId"],
          quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        })),
      } satisfies DeliveryReturnState;
    },
    async netFulfilledBySaleLine(
      workspaceId: WorkspaceId,
      saleId: SaleId,
      excludeDeliveryId: DeliveryId | null,
    ) {
      const rows = await tx.execute(sql`
          with excluded_dispatched as (
            select dl.sale_line_id, sum(dl.quantity_scaled) as dispatched
            from ${deliveryLines} dl
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
              and d.status in ('dispatched', 'delivered')
              and d.id = ${excludeDeliveryId}::uuid
            group by dl.sale_line_id
          ), excluded_returned as (
            select dl.sale_line_id, sum(drl.quantity_scaled) as returned
            from ${deliveryReturnLines} drl
            join ${deliveryReturns} dr
              on dr.workspace_id = drl.workspace_id and dr.id = drl.return_id
            join ${deliveryLines} dl
              on dl.workspace_id = drl.workspace_id and dl.id = drl.delivery_line_id
            join ${deliveries} d
              on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
            where d.workspace_id = ${workspaceId}::uuid
              and d.sale_id = ${saleId}::uuid
              and d.status in ('dispatched', 'delivered')
              and d.id = ${excludeDeliveryId}::uuid
            group by dl.sale_line_id
          )
          select facts.sale_line_id as "saleLineId",
            facts.net_fulfilled_quantity_scaled
              - coalesce(excluded_dispatched.dispatched, 0)
              + coalesce(excluded_returned.returned, 0) as "net"
          from sale_line_fulfilment_facts_v1 facts
          left join excluded_dispatched
            on excluded_dispatched.sale_line_id = facts.sale_line_id
          left join excluded_returned
            on excluded_returned.sale_line_id = facts.sale_line_id
          where facts.workspace_id = ${workspaceId}::uuid
            and facts.sale_id = ${saleId}::uuid
        `);
      return new Map(
        (rows as unknown as Array<{ saleLineId: string; net: number | string }>).map((row) => [
          String(row.saleLineId),
          persistedBigintToSafeNumber(row.net, "delivery net fulfilled quantity"),
        ]),
      );
    },
    async fulfilmentBySaleLine(workspaceId: WorkspaceId, saleId: SaleId) {
      const rows = await tx.execute(sql`
          select sale_line_id as "saleLineId",
            dispatched_quantity_scaled as "dispatched",
            returned_quantity_scaled as "returned",
            net_fulfilled_quantity_scaled as "netFulfilled",
            active_dispatched_remaining_quantity_scaled as "activeDispatchedRemaining",
            remaining_quantity_scaled as "remaining",
            integrity
          from sale_line_fulfilment_facts_v1
          where workspace_id = ${workspaceId}::uuid and sale_id = ${saleId}::uuid
        `);
      return new Map(
        (
          rows as unknown as Array<{
            saleLineId: string;
            dispatched: number | string;
            returned: number | string;
            netFulfilled: number | string;
            activeDispatchedRemaining: number | string;
            remaining: number | string;
            integrity: boolean;
          }>
        ).map((row) => [
          String(row.saleLineId),
          {
            dispatchedQuantityScaled: persistedBigintToSafeNumber(
              row.dispatched,
              "delivery dispatched quantity",
            ),
            returnedQuantityScaled: persistedBigintToSafeNumber(
              row.returned,
              "delivery returned quantity",
            ),
            netFulfilledQuantityScaled: persistedBigintToSafeNumber(
              row.netFulfilled,
              "delivery net fulfilled quantity",
            ),
            activeDispatchedRemainingQuantityScaled: persistedBigintToSafeNumber(
              row.activeDispatchedRemaining,
              "delivery active remaining quantity",
            ),
            remainingQuantityScaled: persistedBigintToSafeNumber(
              row.remaining,
              "delivery remaining quantity",
            ),
            integrity: row.integrity,
          } satisfies SaleLineFulfilmentFacts,
        ]),
      );
    },
  },
});
