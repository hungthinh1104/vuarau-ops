import type { SQL } from "drizzle-orm";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { recordDisplayReference } from "@vuarau/domain-contracts";
import {
  customers,
  deliveries,
  deliveryLines,
  deliveryReturns,
  deliveryReturnLines,
  sales,
} from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import {
  fetchLimit,
  paged,
  readDeliveryDto,
  sumPersistedIntegers,
} from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createDeliveryReadRepositories = (tx: Tx) => ({
  deliveryReads: {
    get: (workspaceId: string, deliveryId: string) => readDeliveryDto(tx, workspaceId, deliveryId),
    async list(args: {
      workspaceId: string;
      saleId: string | null;
      status: typeof deliveries.$inferSelect.status | null;
      query: string;
      page: Page;
    }) {
      const filters: SQL[] = [eq(deliveries.workspaceId, args.workspaceId)];
      if (args.saleId !== null) filters.push(eq(deliveries.saleId, args.saleId));
      if (args.status !== null) filters.push(eq(deliveries.status, args.status));
      if (args.query.length > 0) {
        const pattern = `%${args.query}%`;
        const referencePattern = `%${args.query.replace(/^[A-Z]{2,4}-/i, "")}%`;
        filters.push(sql`(
          ${deliveries.id}::text ILIKE ${referencePattern}
          OR ${deliveries.saleId}::text ILIKE ${referencePattern}
          OR EXISTS (
            SELECT 1 FROM ${sales}
            INNER JOIN ${customers} ON ${customers.workspaceId} = ${sales.workspaceId}
              AND ${customers.id} = ${sales.customerId}
            WHERE ${sales.workspaceId} = ${deliveries.workspaceId}
              AND ${sales.id} = ${deliveries.saleId}
              AND vuarau_fold(${customers.displayName}) ILIKE vuarau_fold(${pattern})
          )
          OR EXISTS (
            SELECT 1 FROM ${deliveryLines} search_lines
            WHERE search_lines.workspace_id = ${deliveries.workspaceId}
              AND search_lines.delivery_id = ${deliveries.id}
              AND vuarau_fold(search_lines.product_name) ILIKE vuarau_fold(${pattern})
          )
        )`);
      }
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${deliveries.transactionTime}, ${deliveries.recordedAt}, ${deliveries.id})
            < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(deliveries)
        .where(and(...filters))
        .orderBy(desc(deliveries.transactionTime), desc(deliveries.recordedAt), desc(deliveries.id))
        .limit(fetchLimit(args.page));
      const ids = rows.map((row) => row.id);
      const [lineRows, returnRows, saleRows] =
        ids.length === 0
          ? [[], [], []]
          : await Promise.all([
              tx
                .select()
                .from(deliveryLines)
                .where(
                  and(
                    eq(deliveryLines.workspaceId, args.workspaceId),
                    inArray(deliveryLines.deliveryId, ids),
                  ),
                ),
              tx
                .select()
                .from(deliveryReturns)
                .where(
                  and(
                    eq(deliveryReturns.workspaceId, args.workspaceId),
                    inArray(deliveryReturns.deliveryId, ids),
                  ),
                ),
              tx
                .select({
                  id: sales.id,
                  customerDisplayName: customers.displayName,
                })
                .from(sales)
                .leftJoin(
                  customers,
                  and(
                    eq(customers.workspaceId, sales.workspaceId),
                    eq(customers.id, sales.customerId),
                  ),
                )
                .where(
                  and(
                    eq(sales.workspaceId, args.workspaceId),
                    inArray(
                      sales.id,
                      rows.map((row) => row.saleId),
                    ),
                  ),
                ),
            ]);
      const saleSummaries = new Map(
        saleRows.map((row) => [row.id, row.customerDisplayName ?? null]),
      );
      const returnIds = returnRows.map((row) => row.id);
      const returnLineRows =
        returnIds.length === 0
          ? []
          : await tx
              .select()
              .from(deliveryReturnLines)
              .where(inArray(deliveryReturnLines.returnId, returnIds));
      const loaded = rows.map((row) => {
        const deliveryLineRows = lineRows.filter((line) => line.deliveryId === row.id);
        const deliveryReturnRows = returnRows.filter((record) => record.deliveryId === row.id);
        return {
          id: row.id,
          workspaceId: row.workspaceId,
          saleId: row.saleId,
          status: row.status,
          lines: deliveryLineRows.map((line) => ({
            deliveryLineId: line.id,
            saleLineId: line.saleLineId,
            productId: line.productId,
            productName: line.productName,
            quantity: { valueScaled: line.quantityScaled, unit: line.unit },
            returnedQuantity: {
              valueScaled: sumPersistedIntegers(
                returnLineRows
                  .filter((item) => item.deliveryLineId === line.id)
                  .map((item) => item.quantityScaled),
                "delivery.returned.quantity_scaled",
              ),
              unit: line.unit,
            },
          })),
          note: row.note,
          evidenceReferences: row.evidenceReferences ?? [],
          cancellationReason: row.cancellationReason,
          version: row.version,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          dispatchedAt: toIsoOrNull(row.dispatchedAt),
          deliveredAt: toIsoOrNull(row.deliveredAt),
          returns: deliveryReturnRows.map((record) => ({
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
          displayReference: recordDisplayReference("delivery", row.id),
          saleDisplayReference: recordDisplayReference("sale", row.saleId),
          customerDisplayName: saleSummaries.get(row.saleId) ?? null,
          primaryProductName: deliveryLineRows[0]?.productName ?? null,
          lineCount: deliveryLineRows.length,
        };
      });
      return paged(loaded, args.page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
