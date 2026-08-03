import { and, asc, eq, inArray } from "drizzle-orm";
import type { documents } from "../../schema/index.ts";
import {
  customers,
  payments,
  purchases,
  purchaseLines,
  purchaseVoids,
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
} from "../../schema/index.ts";
import { money, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Tx } from "./types.ts";

export type Page = { after: { sortValue: string; id: string } | null; limit: number };

export function vietnamBusinessDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

export function fetchLimit(page: Page): number {
  return page.limit + 1;
}

export function paged<TRow>(
  rows: readonly TRow[],
  page: Page,
  key: (row: TRow) => { sortValue: string; id: string },
): { rows: readonly TRow[]; next: { sortValue: string; id: string } | null } {
  if (rows.length <= page.limit) {
    return { rows, next: null };
  }
  const visible = rows.slice(0, page.limit);
  return { rows: visible, next: key(visible[visible.length - 1]!) };
}

export async function readPurchaseDto(tx: Tx, workspaceId: string, purchaseId: string) {
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
      )
      .orderBy(asc(purchaseLines.id)),
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
      unitPrice: money(line.unitPriceMinor, line.currency),
      lineTotal: money(line.lineTotalMinor, line.currency),
    })),
    totalAmount: money(row.totalAmountMinor, row.currency),
    note: row.note,
    evidenceReferences: [...row.evidenceReferences],
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
            purchaseId: voidRow.purchaseId,
            reasonCode: voidRow.reasonCode as
              | "wrong_supplier"
              | "wrong_product"
              | "wrong_quantity"
              | "wrong_price"
              | "duplicate"
              | "commercial_correction"
              | "other",
            reason: voidRow.reason,
            evidenceReferences: [...voidRow.evidenceReferences],
            amount: money(voidRow.amountMinor, voidRow.currency),
            policyVersionId: voidRow.policyVersionId,
            transactionTime: toIso(voidRow.transactionTime),
            recordedAt: toIso(voidRow.recordedAt),
          },
  };
}

export async function readReceiptDto(tx: Tx, workspaceId: string, receiptId: string) {
  const rows = await tx
    .select()
    .from(purchaseReceipts)
    .where(and(eq(purchaseReceipts.workspaceId, workspaceId), eq(purchaseReceipts.id, receiptId)))
    .limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  const [lines, reversals] = await Promise.all([
    tx
      .select()
      .from(purchaseReceiptLines)
      .where(
        and(
          eq(purchaseReceiptLines.workspaceId, workspaceId),
          eq(purchaseReceiptLines.receiptId, receiptId),
        ),
      )
      .orderBy(asc(purchaseReceiptLines.id)),
    tx
      .select()
      .from(purchaseReceiptReversals)
      .where(
        and(
          eq(purchaseReceiptReversals.workspaceId, workspaceId),
          eq(purchaseReceiptReversals.receiptId, receiptId),
        ),
      )
      .limit(1),
  ]);
  const reversal = reversals[0];
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    purchaseId: row.purchaseId,
    lines: lines.map((line) => ({
      receiptLineId: line.id,
      purchaseLineId: line.purchaseLineId,
      productId: line.productId,
      qualityGradeId: line.qualityGradeId,
      qualityGradeName: line.qualityGradeName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
    })),
    note: row.note,
    evidenceReferences: row.evidenceReferences ?? [],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId,
    reversal:
      reversal === undefined
        ? null
        : {
            id: reversal.id,
            reasonCode: reversal.reasonCode,
            reason: reversal.reason,
            transactionTime: toIso(reversal.transactionTime),
            recordedAt: toIso(reversal.recordedAt),
            actorId: reversal.actorId,
            evidenceReferences: reversal.evidenceReferences ?? [],
          },
  };
}

export async function readDeliveryDto(tx: Tx, workspaceId: string, deliveryId: string) {
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
  const returnLineRows =
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
    lines: lines.map((line) => {
      const returnedQuantity = returnLineRows
        .filter((item) => item.deliveryLineId === line.id)
        .reduce((sum, item) => sum + item.quantityScaled, 0);
      return {
        deliveryLineId: line.id,
        saleLineId: line.saleLineId,
        productId: line.productId,
        productName: line.productName,
        qualityGradeId: line.qualityGradeId,
        qualityGradeName: line.qualityGradeName,
        quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        returnedQuantity: { valueScaled: returnedQuantity, unit: line.unit },
      };
    }),
    note: row.note,
    cancellationReason: row.cancellationReason,
    evidenceReferences: row.evidenceReferences ?? [],
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    dispatchedAt: toIsoOrNull(row.dispatchedAt),
    deliveredAt: toIsoOrNull(row.deliveredAt),
    returns: returnRows.map((record) => ({
      id: record.id,
      reason: record.reason,
      evidenceReferences: record.evidenceReferences ?? [],
      lines: returnLineRows
        .filter((item) => item.returnId === record.id)
        .map((item) => ({
          deliveryLineId: item.deliveryLineId,
          quantity: { valueScaled: item.quantityScaled, unit: item.unit },
        })),
      transactionTime: toIso(record.transactionTime),
      recordedAt: toIso(record.recordedAt),
      actorId: record.actorId,
    })),
  };
}

export const toDocumentDto = (row: typeof documents.$inferSelect) => ({
  id: row.id,
  workspaceId: row.workspaceId,
  documentType: row.documentType,
  sourceType: row.sourceType,
  sourceId: row.sourceId,
  version: row.version,
  snapshot: row.snapshot as Record<string, unknown>,
  digest: row.digest,
  generatedAt: toIso(row.generatedAt),
  generatedBy: row.generatedBy,
});

export function paymentSelect(tx: Tx) {
  return tx
    .select({
      id: payments.id,
      workspaceId: payments.workspaceId,
      customerId: payments.customerId,
      customerDisplayName: customers.displayName,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      cashAccountId: payments.cashAccountId,
      status: payments.status,
      reversedAmountMinor: payments.reversedAmountMinor,
      payerName: payments.payerName,
      note: payments.note,
      evidenceReferences: payments.evidenceReferences,
      version: payments.version,
      transactionTime: payments.transactionTime,
      recordedAt: payments.recordedAt,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId));
}

export function toPaymentSummary(row: {
  id: string;
  workspaceId: string;
  customerId: string;
  customerDisplayName: string;
  amountMinor: number;
  currency: "VND";
  method: "cash" | "bank_transfer" | "other";
  cashAccountId: string | null;
  status: "recorded" | "partially_reversed" | "reversed";
  reversedAmountMinor: number;
  payerName: string | null;
  note: string | null;
  evidenceReferences: string[];
  version: number;
  transactionTime: Date;
  recordedAt: Date;
}) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    customerId: row.customerId,
    customerDisplayName: row.customerDisplayName,
    amount: money(row.amountMinor, row.currency),
    method: row.method,
    cashAccountId: row.cashAccountId,
    status: row.status,
    reversedAmount: money(row.reversedAmountMinor, row.currency),
    payerName: row.payerName,
    note: row.note,
    evidenceReferences: row.evidenceReferences,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

export function sourceLabel(row: {
  sourceType: string;
  saleTotalMinor: number | null;
  voidReasonCode: string | null;
  paymentMethod: string | null;
  reversalAmountMinor: number | null;
  reasonCode: string | null;
}): string {
  switch (row.sourceType) {
    case "sale_posting":
      return row.saleTotalMinor === null ? "Sale" : `Sale · ${row.saleTotalMinor}`;
    case "sale_void":
      return row.voidReasonCode === null ? "Sale void" : `Sale void · ${row.voidReasonCode}`;
    case "payment":
      return row.paymentMethod === null ? "Payment" : `Payment · ${row.paymentMethod}`;
    case "payment_reversal":
      return row.reversalAmountMinor === null
        ? "Payment reversal"
        : `Payment reversal · ${row.reversalAmountMinor}`;
    case "manual_adjustment":
      return row.reasonCode === null ? "Adjustment" : `Adjustment · ${row.reasonCode}`;
    default:
      return row.sourceType;
  }
}

export function sourceDocument(row: {
  sourceType: string;
  sourceId: string;
  voidSaleId: string | null;
  reversalPaymentId: string | null;
}): { type: "sale" | "payment" | "adjustment"; id: string } {
  switch (row.sourceType) {
    case "sale_posting":
      return { type: "sale", id: row.sourceId };
    case "sale_void":
      return { type: "sale", id: row.voidSaleId ?? row.sourceId };
    case "payment":
      return { type: "payment", id: row.sourceId };
    case "payment_reversal":
      return { type: "payment", id: row.reversalPaymentId ?? row.sourceId };
    case "manual_adjustment":
      return { type: "adjustment", id: row.sourceId };
    default:
      return { type: "adjustment", id: row.sourceId };
  }
}

export function auditCorrection(row: {
  action: string;
  aggregateType: string;
  aggregateId: string;
  replacesSaleId: string | null;
}): { relation: "voids_sale" | "replaces_sale"; targetSaleId: string } | null {
  if (row.aggregateType !== "sale") {
    return null;
  }
  if (row.action === "sale.voided") {
    return { relation: "voids_sale", targetSaleId: row.aggregateId };
  }
  if (row.replacesSaleId !== null) {
    return { relation: "replaces_sale", targetSaleId: row.replacesSaleId };
  }
  return null;
}
