import { and, eq, sql } from "drizzle-orm";
import type { WorkspaceId } from "@vuarau/domain-contracts";
import type {
  PurchaseState,
  PurchaseVoidState,
  PurchaseReceiptState,
  PurchaseReceiptReversalState,
} from "@vuarau/domain-kernel";
import {
  purchases,
  purchaseLines,
  purchaseVoids,
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
} from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toIso } from "../row-mappers.ts";
import { loadPurchase } from "../shared/write-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createPurchaseWriteRepositories = (tx: Tx) => ({
  purchases: {
    findById: (workspaceId: WorkspaceId, purchaseId: string) =>
      loadPurchase(tx, workspaceId, purchaseId),
    async findReplacementOf(workspaceId: WorkspaceId, purchaseId: string) {
      const rows = await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(
          and(eq(purchases.workspaceId, workspaceId), eq(purchases.replacesPurchaseId, purchaseId)),
        )
        .limit(1);
      return rows[0] === undefined ? null : loadPurchase(tx, workspaceId, rows[0].id);
    },
    async findByIdForUpdate(workspaceId: WorkspaceId, purchaseId: string) {
      await tx
        .select({ id: purchases.id })
        .from(purchases)
        .where(and(eq(purchases.workspaceId, workspaceId), eq(purchases.id, purchaseId)))
        .limit(1)
        .for("update");
      return loadPurchase(tx, workspaceId, purchaseId);
    },
    async insert(purchase: PurchaseState) {
      const inserted = await tx
        .insert(purchases)
        .values({
          id: purchase.id,
          workspaceId: purchase.workspaceId,
          supplierId: purchase.supplierId,
          status: purchase.status,
          currency: purchase.currency,
          totalAmountMinor: purchase.totalAmount.amountMinor,
          note: purchase.note,
          dueAt: fromIsoOrNull(purchase.dueAt),
          version: purchase.version,
          transactionTime: fromIso(purchase.transactionTime),
          recordedAt: fromIso(purchase.recordedAt),
          confirmedAt: fromIsoOrNull(purchase.confirmedAt),
          discardedAt: fromIsoOrNull(purchase.discardedAt),
          replacesPurchaseId: purchase.replacesPurchaseId,
        })
        .onConflictDoNothing()
        .returning({ id: purchases.id });
      if (inserted.length === 0) return false;
      if (purchase.lines.length > 0) {
        await tx.insert(purchaseLines).values(
          purchase.lines.map((line) => ({
            id: line.lineId,
            workspaceId: purchase.workspaceId,
            purchaseId: purchase.id,
            productId: line.productId,
            productName: line.productName,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
            unitPriceMinor: line.unitPrice.amountMinor,
            lineTotalMinor: line.lineTotal.amountMinor,
            currency: line.unitPrice.currency,
          })),
        );
      }
      return true;
    },
    async updateDraft(purchase: PurchaseState, expectedVersion: number, replaceLines: boolean) {
      const rows = await tx
        .update(purchases)
        .set({
          supplierId: purchase.supplierId,
          currency: purchase.currency,
          totalAmountMinor: purchase.totalAmount.amountMinor,
          note: purchase.note,
          dueAt: fromIsoOrNull(purchase.dueAt),
          status: purchase.status,
          version: purchase.version,
          discardedAt: fromIsoOrNull(purchase.discardedAt),
        })
        .where(
          and(
            eq(purchases.workspaceId, purchase.workspaceId),
            eq(purchases.id, purchase.id),
            eq(purchases.version, expectedVersion),
            eq(purchases.status, "draft"),
          ),
        )
        .returning({ id: purchases.id });
      if (rows.length !== 1) return false;
      if (replaceLines) {
        await tx
          .delete(purchaseLines)
          .where(
            and(
              eq(purchaseLines.workspaceId, purchase.workspaceId),
              eq(purchaseLines.purchaseId, purchase.id),
            ),
          );
        if (purchase.lines.length > 0)
          await tx.insert(purchaseLines).values(
            purchase.lines.map((line) => ({
              id: line.lineId,
              workspaceId: purchase.workspaceId,
              purchaseId: purchase.id,
              productId: line.productId,
              productName: line.productName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
              unitPriceMinor: line.unitPrice.amountMinor,
              lineTotalMinor: line.lineTotal.amountMinor,
              currency: line.unitPrice.currency,
            })),
          );
      }
      return true;
    },
    async confirm(purchase: PurchaseState, expectedVersion: number) {
      const rows = await tx
        .update(purchases)
        .set({
          status: purchase.status,
          totalAmountMinor: purchase.totalAmount.amountMinor,
          version: purchase.version,
          confirmedAt: fromIsoOrNull(purchase.confirmedAt),
        })
        .where(
          and(
            eq(purchases.workspaceId, purchase.workspaceId),
            eq(purchases.id, purchase.id),
            eq(purchases.version, expectedVersion),
            eq(purchases.status, "draft"),
          ),
        )
        .returning({ id: purchases.id });
      return rows.length === 1;
    },
    async insertVoid(record: PurchaseVoidState) {
      const rows = await tx
        .insert(purchaseVoids)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          purchaseId: record.purchaseId,
          reasonCode: record.reasonCode,
          reason: record.reason,
          amountMinor: record.amount.amountMinor,
          currency: record.amount.currency,
          transactionTime: fromIso(record.transactionTime),
          recordedAt: fromIso(record.recordedAt),
          actorId: record.actorId,
        })
        .onConflictDoNothing()
        .returning({ id: purchaseVoids.id });
      return rows.length === 1;
    },
  },
  purchaseReceipts: {
    async findById(workspaceId: WorkspaceId, receiptId: string) {
      const rows = await tx
        .select()
        .from(purchaseReceipts)
        .where(
          and(eq(purchaseReceipts.workspaceId, workspaceId), eq(purchaseReceipts.id, receiptId)),
        )
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
          ),
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
          quantity: { valueScaled: line.quantityScaled, unit: line.unit },
        })),
        note: row.note,
        transactionTime: toIso(row.transactionTime),
        recordedAt: toIso(row.recordedAt),
        actorId: row.actorId,
        reversal:
          reversal === undefined
            ? null
            : {
                id: reversal.id,
                workspaceId: reversal.workspaceId,
                receiptId: reversal.receiptId,
                reasonCode: reversal.reasonCode,
                reason: reversal.reason,
                transactionTime: toIso(reversal.transactionTime),
                recordedAt: toIso(reversal.recordedAt),
                actorId: reversal.actorId,
              },
      } as unknown as PurchaseReceiptState;
    },
    async insert(receipt: PurchaseReceiptState) {
      await tx.insert(purchaseReceipts).values({
        id: receipt.id,
        workspaceId: receipt.workspaceId,
        purchaseId: receipt.purchaseId,
        note: receipt.note,
        transactionTime: fromIso(receipt.transactionTime),
        recordedAt: fromIso(receipt.recordedAt),
        actorId: receipt.actorId,
      });
      await tx.insert(purchaseReceiptLines).values(
        receipt.lines.map((line) => ({
          id: line.receiptLineId,
          workspaceId: receipt.workspaceId,
          receiptId: receipt.id,
          purchaseLineId: line.purchaseLineId,
          productId: line.productId,
          quantityScaled: line.quantity.valueScaled,
          unit: line.quantity.unit,
        })),
      );
    },
    async insertReversal(reversal: PurchaseReceiptReversalState) {
      const rows = await tx
        .insert(purchaseReceiptReversals)
        .values({
          id: reversal.id,
          workspaceId: reversal.workspaceId,
          receiptId: reversal.receiptId,
          reasonCode: reversal.reasonCode,
          reason: reversal.reason,
          transactionTime: fromIso(reversal.transactionTime),
          recordedAt: fromIso(reversal.recordedAt),
          actorId: reversal.actorId,
        })
        .onConflictDoNothing()
        .returning({ id: purchaseReceiptReversals.id });
      return rows.length === 1;
    },
    async netReceivedByPurchaseLine(workspaceId: WorkspaceId, purchaseId: string) {
      const rows = await tx.execute(sql`
          select prl.purchase_line_id as "purchaseLineId",
            coalesce(sum(case when prr.id is null then prl.quantity_scaled else 0 end), 0)::bigint as "net"
          from purchase_receipt_lines prl
          join purchase_receipts pr on pr.id = prl.receipt_id and pr.workspace_id = prl.workspace_id
          left join purchase_receipt_reversals prr
            on prr.workspace_id = pr.workspace_id and prr.receipt_id = pr.id
          where pr.workspace_id = ${workspaceId}::uuid and pr.purchase_id = ${purchaseId}::uuid
          group by prl.purchase_line_id
        `);
      return new Map(
        (rows as unknown as Array<{ purchaseLineId: string; net: string }>).map((row) => [
          row.purchaseLineId,
          Number(row.net),
        ]),
      );
    },
  },
});
