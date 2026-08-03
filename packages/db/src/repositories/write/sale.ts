import { and, asc, eq } from "drizzle-orm";
import type { ActorId, CommandId, SaleId, WorkspaceId } from "@vuarau/domain-contracts";
import type { SaleState, SaleVoidState } from "@vuarau/domain-kernel";
import { saleLines, saleVoids, sales } from "../../schema/index.ts";
import { fromIso, fromIsoOrNull, toSaleState } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSaleWriteRepositories = (tx: Tx) => ({
  sales: {
    async findByIdForUpdate(workspaceId: WorkspaceId, saleId: SaleId): Promise<SaleState | null> {
      // Row lock held for the rest of the transaction (ADR-0009). Lines are not
      // locked separately: they are only ever written with their sale.
      //
      // The lock on the *sale* is also what serialises two concurrent voids,
      // even though a void writes to a different table (BR-SALE-013).
      const rows = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.workspaceId, workspaceId), eq(sales.id, saleId)))
        .limit(1)
        .for("update");
      const row = rows[0];
      if (row === undefined) {
        return null;
      }

      const lineRows = await tx
        .select()
        .from(saleLines)
        .where(and(eq(saleLines.workspaceId, workspaceId), eq(saleLines.saleId, saleId)))
        .orderBy(asc(saleLines.position));

      const voidRows = await tx
        .select()
        .from(saleVoids)
        .where(and(eq(saleVoids.workspaceId, workspaceId), eq(saleVoids.saleId, saleId)))
        .limit(1);

      return toSaleState(row, lineRows, voidRows[0] ?? null);
    },

    async insert(sale: SaleState): Promise<void> {
      await tx.insert(sales).values({
        id: sale.id,
        workspaceId: sale.workspaceId,
        customerId: sale.customerId,
        status: sale.status,
        currency: sale.currency,
        totalAmountMinor: sale.totalAmount.amountMinor,
        note: sale.note,
        evidenceReferences: [...sale.evidenceReferences],
        version: sale.version,
        transactionTime: fromIso(sale.transactionTime),
        recordedAt: fromIso(sale.recordedAt),
        postedAt: fromIsoOrNull(sale.postedAt),
        dueAt: fromIsoOrNull(sale.dueAt),
        paymentTermsPolicyVersionId: sale.paymentTermsPolicyVersionId ?? null,
        paymentTermsSource: sale.paymentTermsSource ?? null,
        creditLimitPolicyVersionId: sale.creditLimitPolicyVersionId ?? null,
        replacesSaleId: sale.replacesSaleId,
      });

      if (sale.lines.length > 0) {
        await tx.insert(saleLines).values(
          sale.lines.map((line, position) => ({
            id: line.lineId,
            workspaceId: sale.workspaceId,
            saleId: sale.id,
            productId: line.productId,
            productName: line.productName,
            qualityGradeId: line.qualityGradeId,
            qualityGradeName: line.qualityGradeName,
            quantityScaled: line.quantity.valueScaled,
            unit: line.quantity.unit,
            unitPriceMinor: line.unitPrice.amountMinor,
            lineTotalMinor: line.lineTotal.amountMinor,
            currency: sale.currency,
            position,
          })),
        );
      }
    },

    /**
     * The one and only mutation of a sale: draft → posted (BR-SALE-008).
     *
     * Conditional on the version, so a concurrent writer that slipped between
     * the read and the write loses instead of overwriting (BR-SALE-006), and
     * conditional on `status = 'draft'`, so this cannot touch a posted row even
     * if a caller passed a stale version that happened to match. Sale lines are
     * not rewritten — posting does not change them.
     */
    async post(sale: SaleState, expectedVersion: number): Promise<boolean> {
      const updated = await tx
        .update(sales)
        .set({
          status: "posted",
          totalAmountMinor: sale.totalAmount.amountMinor,
          version: sale.version,
          postedAt: fromIsoOrNull(sale.postedAt),
          dueAt: fromIsoOrNull(sale.dueAt),
          paymentTermsPolicyVersionId: sale.paymentTermsPolicyVersionId ?? null,
          paymentTermsSource: sale.paymentTermsSource ?? null,
          creditLimitPolicyVersionId: sale.creditLimitPolicyVersionId ?? null,
        })
        .where(
          and(
            eq(sales.workspaceId, sale.workspaceId),
            eq(sales.id, sale.id),
            eq(sales.version, expectedVersion),
            eq(sales.status, "draft"),
          ),
        )
        .returning({ id: sales.id });
      return updated.length === 1;
    },

    /**
     * Edits or discards a draft. Conditional on the version **and** on the row
     * still being a draft, so a posted sale is unreachable through this path
     * whatever version arrives (BR-SALE-008).
     */
    async updateDraft(
      sale: SaleState,
      expectedVersion: number,
      options: { replaceLines: boolean },
    ): Promise<boolean> {
      const updated = await tx
        .update(sales)
        .set({
          status: sale.status,
          totalAmountMinor: sale.totalAmount.amountMinor,
          note: sale.note,
          dueAt: fromIsoOrNull(sale.dueAt),
          paymentTermsPolicyVersionId: sale.paymentTermsPolicyVersionId ?? null,
          paymentTermsSource: sale.paymentTermsSource ?? null,
          creditLimitPolicyVersionId: sale.creditLimitPolicyVersionId ?? null,
          discardedAt: fromIsoOrNull(sale.discardedAt),
          version: sale.version,
        })
        .where(
          and(
            eq(sales.workspaceId, sale.workspaceId),
            eq(sales.id, sale.id),
            eq(sales.version, expectedVersion),
            eq(sales.status, "draft"),
          ),
        )
        .returning({ id: sales.id });

      if (updated.length !== 1) {
        return false;
      }

      if (options.replaceLines) {
        // Wholesale replacement, matching the command: a per-line diff would
        // need a merge rule, and any merge rule produces a total nobody typed.
        await tx.delete(saleLines).where(eq(saleLines.saleId, sale.id));
        if (sale.lines.length > 0) {
          await tx.insert(saleLines).values(
            sale.lines.map((line, position) => ({
              id: line.lineId,
              workspaceId: sale.workspaceId,
              saleId: sale.id,
              productId: line.productId,
              productName: line.productName,
              qualityGradeId: line.qualityGradeId,
              qualityGradeName: line.qualityGradeName,
              quantityScaled: line.quantity.valueScaled,
              unit: line.quantity.unit,
              unitPriceMinor: line.unitPrice.amountMinor,
              lineTotalMinor: line.lineTotal.amountMinor,
              currency: sale.currency,
              position,
            })),
          );
        }
      }

      return true;
    },

    /**
     * Appends the void record. Nothing here updates the sale — the sale's
     * financial state is read from this table's existence (BR-SALE-013), and
     * `UNIQUE (sale_id)` makes a second void impossible at the storage layer.
     */
    async insertVoid(
      record: SaleVoidState,
      actorId: ActorId,
      commandId: CommandId,
    ): Promise<boolean> {
      // `onConflictDoNothing` plus a row count, exactly as the receipt claim
      // works: the unique index decides the winner and the loser is told, not
      // crashed (BR-SALE-013).
      const inserted = await tx
        .insert(saleVoids)
        .values({
          id: record.id,
          workspaceId: record.workspaceId,
          saleId: record.saleId,
          reasonCode: record.reasonCode,
          reason: record.reason,
          evidenceReferences: [...record.evidenceReferences],
          amountMinor: record.amount.amountMinor,
          currency: record.amount.currency,
          transactionTime: fromIso(record.transactionTime),
          recordedAt: fromIso(record.recordedAt),
          actorId,
          commandId,
        })
        .onConflictDoNothing()
        .returning({ id: saleVoids.id });
      return inserted.length === 1;
    },
  },
});
