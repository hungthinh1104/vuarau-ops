import { and, asc, eq } from "drizzle-orm";
import type { CustomerOrderState } from "@vuarau/domain-kernel";
import { customerOrderLines, customerOrders } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Tx } from "./types.ts";

export type CustomerOrderRow = typeof customerOrders.$inferSelect;
export type CustomerOrderLineRow = typeof customerOrderLines.$inferSelect;

export function mapCustomerOrderRows(
  rows: readonly CustomerOrderRow[],
  lineRows: readonly CustomerOrderLineRow[],
): CustomerOrderState[] {
  return rows.map((row) => {
    const lines = lineRows
      .filter((line) => line.customerOrderId === row.id)
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((line) => ({
        lineId: line.id,
        productId: line.productId,
        productName: line.productName,
        quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        agreedUnitPrice:
          line.agreedUnitPriceMinor === null
            ? null
            : { amountMinor: line.agreedUnitPriceMinor, currency: line.currency },
        lineTotal:
          line.lineTotalMinor === null
            ? null
            : { amountMinor: line.lineTotalMinor, currency: line.currency },
      }));
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      customerId: row.customerId,
      channel: row.channel,
      status: row.status,
      currency: row.currency,
      lines,
      totalAmount:
        row.totalAmountMinor === null
          ? null
          : { amountMinor: row.totalAmountMinor, currency: row.currency },
      note: row.note,
      paymentTermsSnapshot:
        row.paymentTermsLabel === null
          ? null
          : { label: row.paymentTermsLabel, dueAt: toIsoOrNull(row.paymentTermsDueAt) },
      evidenceReferences: row.evidenceReferences ?? [],
      version: row.version,
      transactionTime: toIso(row.transactionTime),
      recordedAt: toIso(row.recordedAt),
      confirmedAt: toIsoOrNull(row.confirmedAt),
      cancelledAt: toIsoOrNull(row.cancelledAt),
      cancellationReason: row.cancellationReason,
      replacesCustomerOrderId: row.replacesCustomerOrderId,
    } as unknown as CustomerOrderState;
  });
}

export async function loadCustomerOrder(
  tx: Tx,
  workspaceId: string,
  customerOrderId: string,
): Promise<CustomerOrderState | null> {
  const rows = await tx
    .select()
    .from(customerOrders)
    .where(and(eq(customerOrders.workspaceId, workspaceId), eq(customerOrders.id, customerOrderId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const lines = await tx
    .select()
    .from(customerOrderLines)
    .where(
      and(
        eq(customerOrderLines.workspaceId, workspaceId),
        eq(customerOrderLines.customerOrderId, customerOrderId),
      ),
    )
    .orderBy(asc(customerOrderLines.id));
  return mapCustomerOrderRows([row], lines)[0] ?? null;
}
