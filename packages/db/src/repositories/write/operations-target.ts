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
  products,
  purchases,
  qualityGrades,
  qualityIssueCodes,
  sales,
  suppliers,
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
    qualityGradeRows,
    qualityIssueCodeRows,
    goodsArrivalRows,
    saleRows,
    paymentRows,
    entryRows,
    supplierRows,
    purchaseRows,
    movementRows,
    deliveryRows,
    documentRows,
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
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(eq(deliveries.workspaceId, workspaceId))
      .limit(1),
    tx
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.workspaceId, workspaceId))
      .limit(1),
  ]);
  if (
    [
      cashRows,
      customerRows,
      productRows,
      qualityGradeRows,
      qualityIssueCodeRows,
      goodsArrivalRows,
      saleRows,
      paymentRows,
      entryRows,
      supplierRows,
      purchaseRows,
      movementRows,
      deliveryRows,
      documentRows,
    ].some((rows) => rows.length > 0)
  ) {
    return true;
  }
  return false;
}
