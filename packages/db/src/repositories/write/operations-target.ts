import type { WorkspaceId } from "@vuarau/domain-contracts";
import { eq } from "drizzle-orm";
import {
  cashAccounts,
  customerAccountEntries,
  customers,
  deliveries,
  documents,
  goodsArrivals,
  inventoryMovements,
  payments,
  paymentAllocations,
  paymentAllocationReversals,
  products,
  priceRules,
  purchases,
  qualityGrades,
  qualityIssueCodes,
  sales,
  suppliers,
  supplyCommitmentObservations,
  supplierObservations,
  demandObservations,
  stocktakeSessions,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function targetContainsBusinessData(
  tx: Tx,
  workspaceId: WorkspaceId,
): Promise<boolean> {
  const [
    cashRows,
    customerRows,
    productRows,
    priceRuleRows,
    qualityGradeRows,
    qualityIssueCodeRows,
    goodsArrivalRows,
    saleRows,
    paymentRows,
    paymentAllocationRows,
    paymentAllocationReversalRows,
    entryRows,
    supplierRows,
    purchaseRows,
    movementRows,
    stocktakeRows,
    deliveryRows,
    documentRows,
    supplyCommitmentObservationRows,
    supplierObservationRows,
    demandObservationRows,
  ] = await Promise.all([
    tx
      .select({ id: cashAccounts.id })
      .from(cashAccounts)
      .where(eq(cashAccounts.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: customers.id })
      .from(customers)
      .where(eq(customers.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: products.id })
      .from(products)
      .where(eq(products.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: priceRules.id })
      .from(priceRules)
      .where(eq(priceRules.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: qualityGrades.id })
      .from(qualityGrades)
      .where(eq(qualityGrades.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: qualityIssueCodes.id })
      .from(qualityIssueCodes)
      .where(eq(qualityIssueCodes.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: goodsArrivals.id })
      .from(goodsArrivals)
      .where(eq(goodsArrivals.workspaceId, workspaceId))
      .limit(1),
    tx.select({ id: sales.id }).from(sales).where(eq(sales.workspaceId, workspaceId)).limit(1),
    tx
      .select({ id: payments.id })
      .from(payments)
      .where(eq(payments.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: paymentAllocations.id })
      .from(paymentAllocations)
      .where(eq(paymentAllocations.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: paymentAllocationReversals.id })
      .from(paymentAllocationReversals)
      .where(eq(paymentAllocationReversals.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: customerAccountEntries.id })
      .from(customerAccountEntries)
      .where(eq(customerAccountEntries.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: suppliers.id })
      .from(suppliers)
      .where(eq(suppliers.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: purchases.id })
      .from(purchases)
      .where(eq(purchases.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: inventoryMovements.id })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: stocktakeSessions.id })
      .from(stocktakeSessions)
      .where(eq(stocktakeSessions.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: supplyCommitmentObservations.id })
      .from(supplyCommitmentObservations)
      .where(eq(supplyCommitmentObservations.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: supplierObservations.id })
      .from(supplierObservations)
      .where(eq(supplierObservations.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: demandObservations.id })
      .from(demandObservations)
      .where(eq(demandObservations.workspaceId, workspaceId))
      .limit(1),
  ]);
  if (
    [
      cashRows,
      customerRows,
      productRows,
      priceRuleRows,
      qualityGradeRows,
      qualityIssueCodeRows,
      goodsArrivalRows,
      saleRows,
      paymentRows,
      paymentAllocationRows,
      paymentAllocationReversalRows,
      entryRows,
      supplierRows,
      purchaseRows,
      movementRows,
      stocktakeRows,
      deliveryRows,
      documentRows,
      supplyCommitmentObservationRows,
      supplierObservationRows,
      demandObservationRows,
    ].some((rows) => rows.length > 0)
  ) {
    return true;
  }
  return false;
}

export function countBackupRows(payload: Record<string, unknown>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(payload).map(([name, rows]) => [name, Array.isArray(rows) ? rows.length : 1]),
  );
}
