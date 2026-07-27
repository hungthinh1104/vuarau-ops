import { and, asc, desc, eq, gte, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import { alias } from "drizzle-orm/pg-core";
import {
  actors,
  auditLogs,
  customerAccountBalances,
  customerAccountEntries,
  customers,
  paymentReversals,
  payments,
  saleLines,
  saleVoids,
  sales,
} from "../schema/index.ts";
import { classifyBalance } from "@vuarau/domain-kernel";
import { fromIso, money, toIso, toIsoOrNull, toSaleState } from "./row-mappers.ts";

/**
 * The read side, in SQL.
 *
 * Every list here is **keyset paged**: `WHERE (sort, id) < (:sort, :id)` with a
 * matching `ORDER BY sort DESC, id DESC`, reading `limit + 1` rows to learn
 * whether another page exists. Postgres compares row values natively, so the
 * predicate uses the same index the ordering does.
 *
 * `OFFSET` is deliberately absent. It re-reads the rows it skips, and it shifts
 * under concurrent inserts — a sale posted while somebody is paging pushes a row
 * they have already seen onto the next page. When the list is money, a page
 * boundary that silently duplicates a row is a support call.
 *
 * No query in this file runs per row. Names, line counts and entry sources are
 * joined into the page query, because a read that fans out per row degrades
 * exactly as a depot gets busy.
 */

type Tx = PgTransaction<never, never, never>;

type Page = { after: { sortValue: string; id: string } | null; limit: number };

/** Reads one extra row to answer "is there more" without a second count query. */
function fetchLimit(page: Page): number {
  return page.limit + 1;
}

function paged<TRow>(
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

/**
 * Diacritic folding for search.
 *
 * `vuarau_fold` is an IMMUTABLE SQL function installed by migration 0005 rather
 * than the `unaccent` extension: it also folds `đ`/`Đ`, which Vietnamese names
 * are full of and which generic unaccenting leaves alone. Being IMMUTABLE, it can
 * back an expression index the day the customer count makes one worth having.
 */

export function createReadRepositories(tx: Tx) {
  return {
    customerReads: {
      async search(args: {
        workspaceId: string;
        query: string;
        isActive: boolean | null;
        page: Page;
      }) {
        const { workspaceId, query, isActive, page } = args;

        const filters: SQL[] = [eq(customers.workspaceId, workspaceId)];
        if (isActive !== null) {
          filters.push(eq(customers.isActive, isActive));
        }
        if (query.length > 0) {
          const pattern = `%${query}%`;
          filters.push(
            or(
              sql`vuarau_fold(${customers.displayName}) ILIKE vuarau_fold(${pattern})`,
              ilike(customers.phone, pattern),
            )!,
          );
        }
        // Ascending, because a person scans a name list from the top. The id is
        // the tiebreak: two customers may legitimately share a name (ASM-012).
        if (page.after !== null) {
          filters.push(
            sql`(${customers.displayName}, ${customers.id}) > (${page.after.sortValue}, ${page.after.id}::uuid)`,
          );
        }

        const rows = await tx
          .select({
            id: customers.id,
            workspaceId: customers.workspaceId,
            displayName: customers.displayName,
            phone: customers.phone,
            isActive: customers.isActive,
            version: customers.version,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
            lastEntryTransactionTime: customerAccountBalances.lastEntryTransactionTime,
          })
          .from(customers)
          // LEFT: a customer with no entries has no balance row, and their balance
          // is zero because nothing has moved it — not because they are missing.
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .where(and(...filters))
          .orderBy(asc(customers.displayName), asc(customers.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => {
            const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
            return {
              id: row.id,
              workspaceId: row.workspaceId,
              displayName: row.displayName,
              phone: row.phone,
              isActive: row.isActive,
              version: row.version,
              balance,
              classification: classifyBalance(balance),
              lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
            };
          }),
          page,
          (row) => ({ sortValue: row.displayName, id: row.id }),
        );
      },

      async get(workspaceId: string, customerId: string) {
        const rows = await tx
          .select({
            customer: customers,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
          })
          .from(customers)
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .where(and(eq(customers.workspaceId, workspaceId), eq(customers.id, customerId)))
          .limit(1);

        const row = rows[0];
        if (row === undefined) {
          return null;
        }
        const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
        return {
          customer: {
            id: row.customer.id,
            workspaceId: row.customer.workspaceId,
            displayName: row.customer.displayName,
            phone: row.customer.phone,
            note: row.customer.note,
            isActive: row.customer.isActive,
            version: row.customer.version,
            transactionTime: toIso(row.customer.transactionTime),
            recordedAt: toIso(row.customer.recordedAt),
            updatedAt: toIso(row.customer.updatedAt),
          },
          balance,
          classification: classifyBalance(balance),
        };
      },

      async recent(workspaceId: string, limit: number) {
        const rows = await tx
          .select({
            customerId: customers.id,
            displayName: customers.displayName,
            phone: customers.phone,
            balanceMinor: customerAccountBalances.balanceMinor,
            currency: customerAccountBalances.currency,
            lastSale: sql<Date | null>`max(${sales.transactionTime})`,
          })
          .from(customers)
          .leftJoin(
            customerAccountBalances,
            and(
              eq(customerAccountBalances.workspaceId, customers.workspaceId),
              eq(customerAccountBalances.customerId, customers.id),
            ),
          )
          .leftJoin(
            sales,
            and(
              eq(sales.workspaceId, customers.workspaceId),
              eq(sales.customerId, customers.id),
              eq(sales.status, "posted"),
            ),
          )
          .leftJoin(saleVoids, eq(saleVoids.saleId, sales.id))
          .where(
            and(
              eq(customers.workspaceId, workspaceId),
              eq(customers.isActive, true),
              sql`${saleVoids.id} IS NULL`,
            ),
          )
          .groupBy(
            customers.id,
            customers.displayName,
            customers.phone,
            customerAccountBalances.balanceMinor,
            customerAccountBalances.currency,
          )
          .orderBy(desc(sql`max(${sales.transactionTime})`), asc(customers.id))
          .limit(limit);
        return rows.map((row) => {
          const balance = money(row.balanceMinor ?? 0, row.currency ?? "VND");
          return {
            customerId: row.customerId,
            displayName: row.displayName,
            phone: row.phone,
            balance,
            classification: classifyBalance(balance),
            lastSaleTransactionTime: row.lastSale === null ? null : toIso(row.lastSale),
          };
        });
      },
    },

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
          filters.push(
            sql`vuarau_fold(${saleLines.productName}) ILIKE vuarau_fold(${`%${query}%`})`,
          );
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

    paymentReads: {
      async get(workspaceId: string, paymentId: string) {
        const rows = await paymentSelect(tx)
          .where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, paymentId)))
          .limit(1);
        return rows[0] === undefined ? null : toPaymentSummary(rows[0]);
      },

      async list(args: {
        workspaceId: string;
        customerId: string | null;
        status: "recorded" | "partially_reversed" | "reversed" | null;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, customerId, status, from, to, page } = args;

        const filters: SQL[] = [eq(payments.workspaceId, workspaceId)];
        if (customerId !== null) filters.push(eq(payments.customerId, customerId));
        if (status !== null) filters.push(eq(payments.status, status));
        if (from !== null) filters.push(gte(payments.transactionTime, fromIso(from as never)));
        if (to !== null) filters.push(lte(payments.transactionTime, fromIso(to as never)));
        if (page.after !== null) {
          filters.push(
            sql`(${payments.transactionTime}, ${payments.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        const rows = await paymentSelect(tx)
          .where(and(...filters))
          .orderBy(desc(payments.transactionTime), desc(payments.id))
          .limit(fetchLimit(page));

        return paged(rows.map(toPaymentSummary), page, (row) => ({
          sortValue: row.transactionTime,
          id: row.id,
        }));
      },
    },

    accountReads: {
      async timeline(args: {
        workspaceId: string;
        customerId: string;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, customerId, from, to, page } = args;

        const filters: SQL[] = [
          eq(customerAccountEntries.workspaceId, workspaceId),
          eq(customerAccountEntries.customerId, customerId),
        ];
        if (from !== null) {
          filters.push(gte(customerAccountEntries.transactionTime, fromIso(from as never)));
        }
        if (to !== null) {
          filters.push(lte(customerAccountEntries.transactionTime, fromIso(to as never)));
        }
        if (page.after !== null) {
          filters.push(
            sql`(${customerAccountEntries.transactionTime}, ${customerAccountEntries.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        /**
         * The running balance is a window over the customer's **whole** history in
         * business-time order, so an entry shows the same balance whichever page it
         * lands on. Computed here rather than by summing a page client-side: a page
         * is a slice, and a slice cannot know what came before it.
         *
         * The window is evaluated over the partition, not the page, so this is O(n)
         * in the customer's entries per request. At a depot's scale — hundreds to
         * low thousands per customer — that is the right trade for a number that
         * must never disagree with the balance projection. If a customer's history
         * ever makes it hurt, the fix is a stored running total, not a client-side
         * sum.
         */
        const rows = await tx
          .select({
            id: customerAccountEntries.id,
            workspaceId: customerAccountEntries.workspaceId,
            customerId: customerAccountEntries.customerId,
            amountMinor: customerAccountEntries.amountMinor,
            currency: customerAccountEntries.currency,
            sourceType: customerAccountEntries.sourceType,
            sourceId: customerAccountEntries.sourceId,
            reversalOfEntryId: customerAccountEntries.reversalOfEntryId,
            reasonCode: customerAccountEntries.reasonCode,
            reason: customerAccountEntries.reason,
            transactionTime: customerAccountEntries.transactionTime,
            recordedAt: customerAccountEntries.recordedAt,
            actorId: customerAccountEntries.actorId,
            commandId: customerAccountEntries.commandId,
            runningBalanceMinor: sql<number>`sum(${customerAccountEntries.amountMinor}) OVER (
              ORDER BY ${customerAccountEntries.transactionTime}, ${customerAccountEntries.id}
            )::bigint`,
            saleTotalMinor: sales.totalAmountMinor,
            saleTransactionTime: sales.transactionTime,
            voidReasonCode: saleVoids.reasonCode,
            paymentMethod: payments.method,
            reversalAmountMinor: paymentReversals.amountMinor,
          })
          .from(customerAccountEntries)
          // One LEFT JOIN per source kind, resolved in the page query. The
          // alternative is a lookup per entry, which is the N+1 this port forbids.
          .leftJoin(sales, eq(sales.id, customerAccountEntries.sourceId))
          .leftJoin(saleVoids, eq(saleVoids.id, customerAccountEntries.sourceId))
          .leftJoin(payments, eq(payments.id, customerAccountEntries.sourceId))
          .leftJoin(paymentReversals, eq(paymentReversals.id, customerAccountEntries.sourceId))
          .where(and(...filters))
          .orderBy(desc(customerAccountEntries.transactionTime), desc(customerAccountEntries.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            customerId: row.customerId,
            amount: money(row.amountMinor, row.currency),
            runningBalance: money(Number(row.runningBalanceMinor), row.currency),
            source: {
              type: row.sourceType,
              id: row.sourceId,
              label: sourceLabel(row),
            },
            reversalOfEntryId: row.reversalOfEntryId,
            reasonCode: row.reasonCode,
            reason: row.reason,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            actorId: row.actorId,
            commandId: row.commandId,
          })),
          page,
          (row) => ({ sortValue: row.transactionTime, id: row.id }),
        );
      },
    },

    auditReads: {
      async timeline(args: {
        workspaceId: string;
        aggregateType: "customer" | "sale" | "payment" | "debt" | null;
        aggregateId: string | null;
        actorId: string | null;
        from: string | null;
        to: string | null;
        page: Page;
      }) {
        const { workspaceId, aggregateType, aggregateId, actorId, from, to, page } = args;

        const filters: SQL[] = [eq(auditLogs.workspaceId, workspaceId)];
        if (aggregateType !== null) filters.push(eq(auditLogs.aggregateType, aggregateType));
        if (aggregateId !== null) filters.push(eq(auditLogs.aggregateId, aggregateId));
        if (actorId !== null) filters.push(eq(auditLogs.actorId, actorId));
        if (from !== null) filters.push(gte(auditLogs.recordedAt, fromIso(from as never)));
        if (to !== null) filters.push(lte(auditLogs.recordedAt, fromIso(to as never)));
        if (page.after !== null) {
          filters.push(
            sql`(${auditLogs.recordedAt}, ${auditLogs.id}) < (${page.after.sortValue}::timestamptz, ${page.after.id}::uuid)`,
          );
        }

        // Ordered by *recording* time, not business time: an audit trail answers
        // "what happened in what order, as far as this system knew", and a
        // back-dated entry belongs where it was written down, not where it claims
        // to belong (docs/07-data/time-semantics.md).
        const rows = await tx
          .select({
            id: auditLogs.id,
            workspaceId: auditLogs.workspaceId,
            actorId: auditLogs.actorId,
            actorDisplayName: actors.displayName,
            commandId: auditLogs.commandId,
            action: auditLogs.action,
            aggregateType: auditLogs.aggregateType,
            aggregateId: auditLogs.aggregateId,
            transactionTime: auditLogs.transactionTime,
            recordedAt: auditLogs.recordedAt,
            before: auditLogs.before,
            after: auditLogs.after,
            reason: auditLogs.reason,
            rejectionCode: auditLogs.rejectionCode,
            replacesSaleId: sales.replacesSaleId,
          })
          .from(auditLogs)
          .innerJoin(actors, eq(actors.id, auditLogs.actorId))
          // Only meaningful for sale records; null everywhere else, which is what
          // makes `correction` null for a payment or an adjustment.
          .leftJoin(sales, eq(sales.id, auditLogs.aggregateId))
          .where(and(...filters))
          .orderBy(desc(auditLogs.recordedAt), desc(auditLogs.id))
          .limit(fetchLimit(page));

        return paged(
          rows.map((row) => ({
            id: row.id,
            workspaceId: row.workspaceId,
            actorId: row.actorId,
            actorDisplayName: row.actorDisplayName,
            commandId: row.commandId,
            action: row.action,
            aggregateType: row.aggregateType,
            aggregateId: row.aggregateId,
            transactionTime: toIso(row.transactionTime),
            recordedAt: toIso(row.recordedAt),
            before: row.before as Record<string, unknown> | null,
            after: row.after as Record<string, unknown> | null,
            reason: row.reason,
            rejectionCode: row.rejectionCode,
            correction: auditCorrection(row),
          })),
          page,
          (row) => ({ sortValue: row.recordedAt, id: row.id }),
        );
      },
    },
  };
}

function paymentSelect(tx: Tx) {
  return tx
    .select({
      id: payments.id,
      workspaceId: payments.workspaceId,
      customerId: payments.customerId,
      customerDisplayName: customers.displayName,
      amountMinor: payments.amountMinor,
      currency: payments.currency,
      method: payments.method,
      status: payments.status,
      reversedAmountMinor: payments.reversedAmountMinor,
      payerName: payments.payerName,
      note: payments.note,
      version: payments.version,
      transactionTime: payments.transactionTime,
      recordedAt: payments.recordedAt,
    })
    .from(payments)
    .innerJoin(customers, eq(customers.id, payments.customerId));
}

function toPaymentSummary(row: {
  id: string;
  workspaceId: string;
  customerId: string;
  customerDisplayName: string;
  amountMinor: number;
  currency: "VND";
  method: "cash" | "bank_transfer" | "other";
  status: "recorded" | "partially_reversed" | "reversed";
  reversedAmountMinor: number;
  payerName: string | null;
  note: string | null;
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
    status: row.status,
    reversedAmount: money(row.reversedAmountMinor, row.currency),
    payerName: row.payerName,
    note: row.note,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

/**
 * A short human label per source kind, so the timeline names what moved the
 * money rather than showing a uuid (UC-ACCOUNT-001).
 */
function sourceLabel(row: {
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

/**
 * How this action relates to another (UC-AUDIT-001). A void names the sale it
 * undid; a posting on a replacement names the sale it supersedes. Everything else
 * is null — a payment corrects nothing.
 */
function auditCorrection(row: {
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

export type ReadRepositories = ReturnType<typeof createReadRepositories>;
