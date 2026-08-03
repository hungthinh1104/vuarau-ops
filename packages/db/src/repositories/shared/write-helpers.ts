import { and, asc, eq, inArray } from "drizzle-orm";
import type {
  CommandId,
  IdempotencyKey,
  PriceRuleId,
  ProductId,
  SupplierId,
  SupplierPaymentId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type {
  PriceRuleState,
  ProductState,
  SupplierState,
  SupplierPaymentState,
  PurchaseState,
  DeliveryState,
} from "@vuarau/domain-kernel";
import type { priceRules, products, suppliers, supplierPayments } from "../../schema/index.ts";
import {
  purchases,
  purchaseLines,
  purchaseVoids,
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
} from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Tx } from "./types.ts";

export function toProductState(row: typeof products.$inferSelect): ProductState {
  return {
    id: row.id as ProductId,
    workspaceId: row.workspaceId as WorkspaceId,
    displayName: row.name,
    aliases: row.aliases,
    preferredUnit: row.preferredUnit as ProductState["preferredUnit"],
    isActive: row.isActive,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toPriceRuleState(row: typeof priceRules.$inferSelect): PriceRuleState {
  return {
    id: row.id as PriceRuleId,
    workspaceId: row.workspaceId as PriceRuleState["workspaceId"],
    productId: row.productId as PriceRuleState["productId"],
    qualityGradeId: row.qualityGradeId as PriceRuleState["qualityGradeId"],
    customerId: row.customerId as PriceRuleState["customerId"],
    unit: row.unit,
    kind: row.kind,
    priority: row.priority,
    minimumQuantityScaled: row.minimumQuantityScaled,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIsoOrNull(row.effectiveTo),
    baseUnitPrice: { amountMinor: row.baseUnitPriceMinor, currency: row.currency },
    discountPerUnit: { amountMinor: row.discountPerUnitMinor, currency: row.currency },
    feePerUnit: { amountMinor: row.feePerUnitMinor, currency: row.currency },
    finalUnitPrice: { amountMinor: row.finalUnitPriceMinor, currency: row.currency },
    reason: row.reason,
    actorId: row.actorId as PriceRuleState["actorId"],
    commandId: row.commandId as PriceRuleState["commandId"],
    recordedAt: toIso(row.recordedAt),
  };
}

export function toSupplierState(row: typeof suppliers.$inferSelect): SupplierState {
  return {
    id: row.id as SupplierId,
    workspaceId: row.workspaceId as WorkspaceId,
    displayName: row.displayName,
    phone: row.phone,
    note: row.note,
    isActive: row.isActive,
    version: row.version,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function toSupplierPaymentState(
  row: typeof supplierPayments.$inferSelect,
): SupplierPaymentState {
  return {
    id: row.id as SupplierPaymentId,
    workspaceId: row.workspaceId as WorkspaceId,
    supplierId: row.supplierId as SupplierId,
    amount: { amountMinor: row.amountMinor, currency: row.currency },
    method: row.method,
    cashAccountId: row.cashAccountId as NonNullable<SupplierPaymentState["cashAccountId"]> | null,
    note: row.note,
    evidenceReferences: row.evidenceReferences,
    reversedAmount: { amountMinor: row.reversedAmountMinor, currency: row.currency },
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

export async function loadPurchase(tx: Tx, workspaceId: WorkspaceId, purchaseId: string) {
  const rows = await tx
    .select()
    .from(purchases)
    .where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, purchaseId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, voidRows] = await Promise.all([
    tx
      .select()
      .from(purchaseLines)
      .where(
        and(eq(purchaseLines.workspaceId, workspaceId), eq(purchaseLines.purchaseId, purchaseId)),
      ),
    tx
      .select()
      .from(purchaseVoids)
      .where(
        and(eq(purchaseVoids.workspaceId, workspaceId), eq(purchaseVoids.purchaseId, purchaseId)),
      )
      .limit(1),
  ]);
  const voidRow = voidRows[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    supplierId: row.supplierId,
    status: row.status,
    currency: row.currency,
    lines: lines.map((line) => ({
      lineId: line.id,
      productId: line.productId,
      productName: line.productName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
      unitPrice: { amountMinor: line.unitPriceMinor, currency: line.currency },
      lineTotal: { amountMinor: line.lineTotalMinor, currency: line.currency },
    })),
    totalAmount: { amountMinor: row.totalAmountMinor, currency: row.currency },
    note: row.note,
    dueAt: toIsoOrNull(row.dueAt),
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    discardedAt: toIsoOrNull(row.discardedAt),
    replacesPurchaseId: row.replacesPurchaseId,
    voidRecord:
      voidRow === undefined
        ? null
        : {
            id: voidRow.id,
            workspaceId: voidRow.workspaceId,
            purchaseId: voidRow.purchaseId,
            reasonCode: voidRow.reasonCode,
            reason: voidRow.reason,
            amount: { amountMinor: voidRow.amountMinor, currency: voidRow.currency },
            policyVersionId: voidRow.policyVersionId,
            transactionTime: toIso(voidRow.transactionTime),
            recordedAt: toIso(voidRow.recordedAt),
            actorId: voidRow.actorId,
          },
  } as unknown as PurchaseState;
}

export async function loadDelivery(tx: Tx, workspaceId: WorkspaceId, deliveryId: string) {
  const rows = await tx
    .select()
    .from(deliveries)
    .where(and(eq(deliveries.workspaceId, workspaceId), eq(deliveries.id, deliveryId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, returnRows] = await Promise.all([
    tx
      .select()
      .from(deliveryLines)
      .where(
        and(eq(deliveryLines.workspaceId, workspaceId), eq(deliveryLines.deliveryId, deliveryId)),
      )
      .orderBy(asc(deliveryLines.id)),
    tx
      .select()
      .from(deliveryReturns)
      .where(
        and(
          eq(deliveryReturns.workspaceId, workspaceId),
          eq(deliveryReturns.deliveryId, deliveryId),
        ),
      )
      .orderBy(
        asc(deliveryReturns.transactionTime),
        asc(deliveryReturns.recordedAt),
        asc(deliveryReturns.id),
      ),
  ]);
  const returnIds = returnRows.map((record) => record.id);
  const returnLines =
    returnIds.length === 0
      ? []
      : await tx
          .select()
          .from(deliveryReturnLines)
          .where(inArray(deliveryReturnLines.returnId, returnIds));
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    saleId: row.saleId,
    status: row.status,
    lines: lines.map((line) => ({
      deliveryLineId: line.id,
      saleLineId: line.saleLineId,
      productId: line.productId,
      productName: line.productName,
      qualityGradeId: line.qualityGradeId,
      qualityGradeName: line.qualityGradeName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
    })),
    note: row.note,
    cancellationReason: row.cancellationReason,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    dispatchedAt: toIsoOrNull(row.dispatchedAt),
    deliveredAt: toIsoOrNull(row.deliveredAt),
    actorId: row.actorId,
    evidenceReferences: row.evidenceReferences ?? [],
    returns: returnRows.map((record) => ({
      id: record.id,
      workspaceId: record.workspaceId,
      deliveryId: record.deliveryId,
      lines: returnLines
        .filter((line) => line.returnId === record.id)
        .map((line) => ({
          deliveryLineId: line.deliveryLineId,
          quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        })),
      reason: record.reason,
      evidenceReferences: record.evidenceReferences ?? [],
      transactionTime: toIso(record.transactionTime),
      recordedAt: toIso(record.recordedAt),
      actorId: record.actorId,
    })),
  } as unknown as DeliveryState;
}

export function toReceipt(row: {
  commandId: string;
  workspaceId: string;
  idempotencyKey: string;
  commandType: string;
  payloadHash: string;
  status: "in_progress" | "completed";
  result: unknown;
  recordedAt: Date;
}) {
  return {
    commandId: row.commandId as CommandId,
    workspaceId: row.workspaceId as WorkspaceId,
    idempotencyKey: row.idempotencyKey as IdempotencyKey,
    commandType: row.commandType,
    payloadHash: row.payloadHash,
    status: row.status,
    result: row.result,
    recordedAt: toIso(row.recordedAt),
  };
}
