import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { customers, saleLines, saleVoids, sales } from "../../schema/index.ts";
import { fromIso, money, toIso, toIsoOrNull, toSaleState } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createSaleReadRepositories = (tx: Tx) => ({
  saleReads: {
    /** No `FOR UPDATE`: a screen refresh must not block a posting. */
    async get(workspaceId: string, saleId: string) {
      const rows = await tx
        .select()
        .from(sales)
        .where(and(eq(sales.workspaceId, workspaceId), eq(sales.id, saleId)))
        .limit(1);
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

    async replacedBy(workspaceId: string, saleId: string) {
      const rows = await tx
        .select({ id: sales.id })
        .from(sales)
        .where(and(eq(sales.workspaceId, workspaceId), eq(sales.replacesSaleId, saleId)))
        .limit(1);
      return rows[0]?.id ?? null;
    },

    async list(args: {
      workspaceId: string;
      customerId: string | null;
      status: "draft" | "posted" | null;
      voided: boolean | null;
      from: string | null;
      to: string | null;
      page: Page;
    }) {
      const { workspaceId, customerId, status, voided, from, to, page } = args;
      const replacement = alias(sales, "replacement");

      const filters: SQL[] = [eq(sales.workspaceId, workspaceId)];
      if (customerId !== null) filters.push(eq(sales.customerId, customerId));
      if (status !== null) filters.push(eq(sales.status, status));
      if (from !== null) filters.push(gte(sales.transactionTime, fromIso(from as never)));
      if (to !== null) filters.push(lte(sales.transactionTime, fromIso(to as never)));
      // The financial state is derived from the void table (BR-SALE-013), so
      // filtering on it is a filter on the join, not on a column.
      if (voided === true) filters.push(sql`${saleVoids.id} IS NOT NULL`);
      if (voided === false) filters.push(sql`${saleVoids.id} IS NULL`);
      if (page.after !== null) {
        filters.push(
          sql`(${sales.transactionTime}, ${sales.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
        );
      }

      const rows = await tx
        .select({
          id: sales.id,
          workspaceId: sales.workspaceId,
          customerId: sales.customerId,
          customerDisplayName: customers.displayName,
          status: sales.status,
          voidId: saleVoids.id,
          totalAmountMinor: sales.totalAmountMinor,
          currency: sales.currency,
          version: sales.version,
          transactionTime: sales.transactionTime,
          recordedAt: sales.recordedAt,
          postedAt: sales.postedAt,
          discardedAt: sales.discardedAt,
          dueAt: sales.dueAt,
          replacesSaleId: sales.replacesSaleId,
          replacedBySaleId: replacement.id,
          // A correlated count rather than a join and a GROUP BY: it keeps the
          // page query flat, and it is one index probe per returned row inside
          // the same statement — not a round trip per row.
          lineCount: sql<number>`(
              SELECT count(*)::int FROM ${saleLines}
              WHERE ${saleLines.saleId} = ${sales.id}
            )`,
        })
        .from(sales)
        .innerJoin(customers, eq(customers.id, sales.customerId))
        .leftJoin(
          saleVoids,
          and(eq(saleVoids.workspaceId, sales.workspaceId), eq(saleVoids.saleId, sales.id)),
        )
        .leftJoin(
          replacement,
          and(
            eq(replacement.workspaceId, sales.workspaceId),
            eq(replacement.replacesSaleId, sales.id),
          ),
        )
        .where(and(...filters))
        .orderBy(desc(sales.transactionTime), desc(sales.id))
        .limit(fetchLimit(page));

      return paged(
        rows.map((row) => ({
          id: row.id,
          workspaceId: row.workspaceId,
          customerId: row.customerId,
          customerDisplayName: row.customerDisplayName,
          status: row.status,
          isVoided: row.voidId !== null,
          totalAmount: money(row.totalAmountMinor, row.currency),
          lineCount: row.lineCount,
          version: row.version,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          postedAt: toIsoOrNull(row.postedAt),
          discardedAt: toIsoOrNull(row.discardedAt),
          dueAt: toIsoOrNull(row.dueAt),
          replacesSaleId: row.replacesSaleId,
          replacedBySaleId: row.replacedBySaleId,
        })),
        page,
        (row) => ({ sortValue: row.transactionTime, id: row.id }),
      );
    },

    async captureContext({
      workspaceId,
      customerId,
      query,
      limit,
    }: {
      workspaceId: string;
      customerId: string;
      query: string;
      limit: number;
    }) {
      const filters: SQL[] = [
        eq(sales.workspaceId, workspaceId),
        eq(sales.status, "posted"),
        sql`${saleVoids.id} IS NULL`,
      ];
      if (query.length > 0) {
        filters.push(sql`vuarau_fold(${saleLines.productName}) ILIKE vuarau_fold(${`%${query}%`})`);
      }
      const rows = await tx
        .select({
          customerId: sales.customerId,
          saleId: sales.id,
          transactionTime: sales.transactionTime,
          productName: saleLines.productName,
          unit: saleLines.unit,
          unitPriceMinor: saleLines.unitPriceMinor,
          currency: saleLines.currency,
          position: saleLines.position,
        })
        .from(saleLines)
        .innerJoin(sales, eq(sales.id, saleLines.saleId))
        .leftJoin(saleVoids, eq(saleVoids.saleId, sales.id))
        .where(and(...filters))
        .orderBy(desc(sales.transactionTime), desc(sales.id), asc(saleLines.position));

      const customerHistory = [] as Array<{
        productName: string;
        unit: string;
        lastUnitPrice: ReturnType<typeof money>;
        lastTransactionTime: string;
        sourceSaleId: string;
      }>;
      const workspaceHistory = [] as Array<{ productName: string; unit: string }>;
      const customerSeen = new Set<string>();
      const workspaceSeen = new Set<string>();
      for (const row of rows) {
        const identity = `${row.productName}\u0000${row.unit}`;
        if (!workspaceSeen.has(identity) && workspaceHistory.length < limit) {
          workspaceSeen.add(identity);
          workspaceHistory.push({ productName: row.productName, unit: row.unit });
        }
        if (
          row.customerId === customerId &&
          !customerSeen.has(identity) &&
          customerHistory.length < limit
        ) {
          customerSeen.add(identity);
          customerHistory.push({
            productName: row.productName,
            unit: row.unit,
            lastUnitPrice: money(row.unitPriceMinor, row.currency),
            lastTransactionTime: toIso(row.transactionTime),
            sourceSaleId: row.saleId,
          });
        }
        if (customerHistory.length >= limit && workspaceHistory.length >= limit) break;
      }
      return { customerHistory, workspaceHistory };
    },
  },
});
