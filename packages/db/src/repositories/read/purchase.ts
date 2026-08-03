import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { purchases, purchaseLines, purchaseVoids } from "../../schema/index.ts";
import { money, toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, readPurchaseDto } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createPurchaseReadRepositories = (tx: Tx) => ({
  purchaseReads: {
    async get(workspaceId: string, purchaseId: string) {
      return readPurchaseDto(tx, workspaceId, purchaseId);
    },
    async list(args: {
      workspaceId: string;
      supplierId: string | null;
      status: string | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(purchases.workspaceId, args.workspaceId)];
      if (args.supplierId !== null) filters.push(eq(purchases.supplierId, args.supplierId));
      if (args.status !== null)
        filters.push(eq(purchases.status, args.status as typeof purchases.$inferSelect.status));
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${purchases.transactionTime}, ${purchases.recordedAt}, ${purchases.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const purchaseRows = await tx
        .select()
        .from(purchases)
        .where(and(...filters))
        .orderBy(desc(purchases.transactionTime), desc(purchases.recordedAt), desc(purchases.id))
        .limit(fetchLimit(args.page));
      const purchaseIds = purchaseRows.map((row) => row.id);
      const [lineRows, voidRows] =
        purchaseIds.length === 0
          ? ([[], []] as const)
          : await Promise.all([
              tx
                .select()
                .from(purchaseLines)
                .where(
                  and(
                    eq(purchaseLines.workspaceId, args.workspaceId),
                    inArray(purchaseLines.purchaseId, purchaseIds),
                  ),
                )
                .orderBy(asc(purchaseLines.id)),
              tx
                .select()
                .from(purchaseVoids)
                .where(
                  and(
                    eq(purchaseVoids.workspaceId, args.workspaceId),
                    inArray(purchaseVoids.purchaseId, purchaseIds),
                  ),
                ),
            ]);
      const mapped = purchaseRows.map((row) => {
        const voidRow = voidRows.find((candidate) => candidate.purchaseId === row.id);
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          supplierId: row.supplierId,
          status: row.status,
          currency: row.currency,
          lines: lineRows
            .filter((line) => line.purchaseId === row.id)
            .map((line) => ({
              lineId: line.id,
              productId: line.productId,
              productName: line.productName,
              quantity: { valueScaled: line.quantityScaled, unit: line.unit },
              unitPrice: money(line.unitPriceMinor, line.currency),
              lineTotal: money(line.lineTotalMinor, line.currency),
            })),
          totalAmount: money(row.totalAmountMinor, row.currency),
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
                  purchaseId: voidRow.purchaseId,
                  reasonCode: voidRow.reasonCode,
                  reason: voidRow.reason,
                  evidenceReferences: [...voidRow.evidenceReferences],
                  amount: money(voidRow.amountMinor, voidRow.currency),
                  policyVersionId: voidRow.policyVersionId,
                  transactionTime: toIso(voidRow.transactionTime),
                  recordedAt: toIso(voidRow.recordedAt),
                },
        };
      });
      return paged(mapped, args.page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
