import { and, eq } from "drizzle-orm";
import type { CustomerOrderState } from "@vuarau/domain-kernel";
import { customerOrderLines, customerOrders } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull } from "../row-mappers.ts";
import { loadCustomerOrder } from "../shared/customer-order-mappers.ts";
import type { Tx } from "../shared/types.ts";
import type { WorkspaceId } from "@vuarau/domain-contracts";

function lineValues(order: CustomerOrderState) {
  return order.lines.map((line) => ({
    id: line.lineId,
    workspaceId: order.workspaceId,
    customerOrderId: order.id,
    productId: line.productId,
    productName: line.productName,
    quantityScaled: line.quantity.valueScaled,
    unit: line.quantity.unit,
    agreedUnitPriceMinor: line.agreedUnitPrice?.amountMinor ?? null,
    lineTotalMinor: line.lineTotal?.amountMinor ?? null,
    currency: order.currency,
  }));
}

export const createCustomerOrderWriteRepositories = (tx: Tx) => ({
  customerOrders: {
    findById: (workspaceId: WorkspaceId, customerOrderId: string) =>
      loadCustomerOrder(tx, workspaceId, customerOrderId),
    findByIdForUpdate: async (workspaceId: WorkspaceId, customerOrderId: string) => {
      await tx
        .select({ id: customerOrders.id })
        .from(customerOrders)
        .where(
          and(eq(customerOrders.workspaceId, workspaceId), eq(customerOrders.id, customerOrderId)),
        )
        .limit(1)
        .for("update");
      return loadCustomerOrder(tx, workspaceId, customerOrderId);
    },
    async findReplacementOf(workspaceId: WorkspaceId, customerOrderId: string) {
      const rows = await tx
        .select({ id: customerOrders.id })
        .from(customerOrders)
        .where(
          and(
            eq(customerOrders.workspaceId, workspaceId),
            eq(customerOrders.replacesCustomerOrderId, customerOrderId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : loadCustomerOrder(tx, workspaceId, rows[0].id);
    },
    async insert(order: CustomerOrderState) {
      const inserted = await tx
        .insert(customerOrders)
        .values({
          id: order.id,
          workspaceId: order.workspaceId,
          customerId: order.customerId,
          channel: order.channel,
          status: order.status,
          currency: order.currency,
          totalAmountMinor: order.totalAmount?.amountMinor ?? null,
          note: order.note,
          paymentTermsLabel: order.paymentTermsSnapshot?.label ?? null,
          paymentTermsDueAt: fromIsoOrNull(order.paymentTermsSnapshot?.dueAt ?? null),
          evidenceReferences: [...order.evidenceReferences],
          version: order.version,
          transactionTime: fromIso(order.transactionTime),
          recordedAt: fromIso(order.recordedAt),
          confirmedAt: fromIsoOrNull(order.confirmedAt),
          cancelledAt: fromIsoOrNull(order.cancelledAt),
          cancellationReason: order.cancellationReason,
          replacesCustomerOrderId: order.replacesCustomerOrderId,
        })
        .onConflictDoNothing()
        .returning({ id: customerOrders.id });
      if (inserted.length === 0) return false;
      if (order.lines.length > 0) await tx.insert(customerOrderLines).values(lineValues(order));
      return true;
    },
    async updateDraft(order: CustomerOrderState, expectedVersion: number) {
      const rows = await tx
        .update(customerOrders)
        .set({
          customerId: order.customerId,
          channel: order.channel,
          currency: order.currency,
          totalAmountMinor: order.totalAmount?.amountMinor ?? null,
          note: order.note,
          paymentTermsLabel: order.paymentTermsSnapshot?.label ?? null,
          paymentTermsDueAt: fromIsoOrNull(order.paymentTermsSnapshot?.dueAt ?? null),
          evidenceReferences: [...order.evidenceReferences],
          version: order.version,
        })
        .where(
          and(
            eq(customerOrders.workspaceId, order.workspaceId),
            eq(customerOrders.id, order.id),
            eq(customerOrders.version, expectedVersion),
            eq(customerOrders.status, "draft"),
          ),
        )
        .returning({ id: customerOrders.id });
      if (rows.length !== 1) return false;
      await tx
        .delete(customerOrderLines)
        .where(
          and(
            eq(customerOrderLines.workspaceId, order.workspaceId),
            eq(customerOrderLines.customerOrderId, order.id),
          ),
        );
      if (order.lines.length > 0) await tx.insert(customerOrderLines).values(lineValues(order));
      return true;
    },
    async confirm(order: CustomerOrderState, expectedVersion: number) {
      const rows = await tx
        .update(customerOrders)
        .set({
          status: order.status,
          totalAmountMinor: order.totalAmount?.amountMinor ?? null,
          version: order.version,
          confirmedAt: fromIsoOrNull(order.confirmedAt),
        })
        .where(
          and(
            eq(customerOrders.workspaceId, order.workspaceId),
            eq(customerOrders.id, order.id),
            eq(customerOrders.version, expectedVersion),
            eq(customerOrders.status, "draft"),
          ),
        )
        .returning({ id: customerOrders.id });
      if (rows.length !== 1) return false;
      // The line snapshots were already stored on the draft. Confirmation only
      // changes their nullable price/total values when a draft was created before
      // the final agreement was known.
      await tx
        .delete(customerOrderLines)
        .where(
          and(
            eq(customerOrderLines.workspaceId, order.workspaceId),
            eq(customerOrderLines.customerOrderId, order.id),
          ),
        );
      await tx.insert(customerOrderLines).values(lineValues(order));
      return true;
    },
    async cancel(order: CustomerOrderState, expectedVersion: number) {
      const rows = await tx
        .update(customerOrders)
        .set({
          status: order.status,
          version: order.version,
          cancelledAt: fromIsoOrNull(order.cancelledAt),
          cancellationReason: order.cancellationReason,
        })
        .where(
          and(
            eq(customerOrders.workspaceId, order.workspaceId),
            eq(customerOrders.id, order.id),
            eq(customerOrders.version, expectedVersion),
          ),
        )
        .returning({ id: customerOrders.id });
      return rows.length === 1;
    },
  },
});
