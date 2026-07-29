import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  actors,
  customerAccountEntries,
  customers,
  paymentReversals,
  payments,
  saleVoids,
  sales,
  workspaces,
} from "../../schema/index.ts";
import { fromIso, money, toIso } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, sourceLabel, sourceDocument } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createAccountReadRepositories = (tx: Tx) => ({
  accountReads: {
    async adjustmentDetail({
      workspaceId,
      adjustmentId,
    }: {
      workspaceId: string;
      adjustmentId: string;
    }) {
      const ranked = tx.$with("ranked").as(
        tx
          .select({
            id: customerAccountEntries.id,
            workspaceId: customerAccountEntries.workspaceId,
            customerId: customerAccountEntries.customerId,
            amountMinor: customerAccountEntries.amountMinor,
            currency: customerAccountEntries.currency,
            reasonCode: customerAccountEntries.reasonCode,
            reason: customerAccountEntries.reason,
            transactionTime: customerAccountEntries.transactionTime,
            recordedAt: customerAccountEntries.recordedAt,
            actorId: customerAccountEntries.actorId,
            commandId: customerAccountEntries.commandId,
            sourceType: customerAccountEntries.sourceType,
            sourceId: customerAccountEntries.sourceId,
            runningBalanceMinor:
              sql<number>`sum(${customerAccountEntries.amountMinor}) over (partition by ${customerAccountEntries.workspaceId}, ${customerAccountEntries.customerId} order by ${customerAccountEntries.transactionTime}, ${customerAccountEntries.recordedAt}, ${customerAccountEntries.id})::bigint`.as(
                "running_balance_minor",
              ),
          })
          .from(customerAccountEntries),
      );
      const [row] = await tx
        .with(ranked)
        .select({
          adjustmentId: ranked.sourceId,
          entryId: ranked.id,
          commandId: ranked.commandId,
          workspaceId: workspaces.id,
          workspaceName: workspaces.name,
          customerId: customers.id,
          customerName: customers.displayName,
          actorId: actors.id,
          actorName: actors.displayName,
          amountMinor: ranked.amountMinor,
          currency: ranked.currency,
          reasonCode: ranked.reasonCode,
          reason: ranked.reason,
          transactionTime: ranked.transactionTime,
          recordedAt: ranked.recordedAt,
          runningBalanceMinor: ranked.runningBalanceMinor,
        })
        .from(ranked)
        // The ledger entry is the record we are looking up. Keep it visible
        // when a referenced row has been damaged or removed, so this read can
        // report an integrity failure instead of incorrectly calling it absent.
        .leftJoin(customers, eq(customers.id, ranked.customerId))
        .leftJoin(workspaces, eq(workspaces.id, ranked.workspaceId))
        .leftJoin(actors, eq(actors.id, ranked.actorId))
        .where(
          and(
            eq(ranked.workspaceId, workspaceId),
            eq(ranked.sourceType, "manual_adjustment"),
            eq(ranked.sourceId, adjustmentId),
          ),
        )
        .limit(1);
      if (row === undefined) return { kind: "not_found" as const };
      if (
        row.reasonCode === null ||
        row.reason === null ||
        row.reason.trim().length === 0 ||
        row.amountMinor === 0
      )
        return { kind: "integrity_error" as const, reason: "missing adjustment fields" };
      if (
        row.workspaceId === null ||
        row.workspaceName === null ||
        row.customerId === null ||
        row.customerName === null ||
        row.actorId === null ||
        row.actorName === null
      )
        return { kind: "integrity_error" as const, reason: "missing joined record" };
      return {
        kind: "found" as const,
        row: {
          adjustmentId: row.adjustmentId,
          entryId: row.entryId,
          commandId: row.commandId,
          workspace: { id: row.workspaceId, name: row.workspaceName },
          customer: { id: row.customerId, displayName: row.customerName },
          actor: { id: row.actorId, displayName: row.actorName },
          amount: money(row.amountMinor, row.currency),
          reasonCode: row.reasonCode,
          reason: row.reason,
          transactionTime: toIso(row.transactionTime),
          recordedAt: toIso(row.recordedAt),
          runningBalance: money(Number(row.runningBalanceMinor), row.currency),
        },
      };
    },
    async timeline(args: {
      workspaceId: string;
      customerId: string;
      from: string | null;
      to: string | null;
      page: Page;
    }) {
      const { workspaceId, customerId, from, to, page } = args;

      const ranked = tx.$with("ranked_account_entries").as(
        tx
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
            runningBalanceMinor:
              sql<number>`sum(${customerAccountEntries.amountMinor}) over (order by ${customerAccountEntries.transactionTime}, ${customerAccountEntries.recordedAt}, ${customerAccountEntries.id})::bigint`.as(
                "running_balance_minor",
              ),
          })
          .from(customerAccountEntries)
          .where(
            and(
              eq(customerAccountEntries.workspaceId, workspaceId),
              eq(customerAccountEntries.customerId, customerId),
            ),
          ),
      );
      const filters: SQL[] = [];
      if (from !== null) {
        filters.push(gte(ranked.transactionTime, fromIso(from as never)));
      }
      if (to !== null) {
        filters.push(lte(ranked.transactionTime, fromIso(to as never)));
      }
      if (page.after !== null) {
        filters.push(
          sql`(${ranked.transactionTime}, ${ranked.recordedAt}, ${ranked.id}) < (split_part(${page.after.sortValue}, '|', 1)::timestamptz, split_part(${page.after.sortValue}, '|', 2)::timestamptz, ${page.after.id}::uuid)`,
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
        .with(ranked)
        .select({
          id: ranked.id,
          workspaceId: ranked.workspaceId,
          customerId: ranked.customerId,
          amountMinor: ranked.amountMinor,
          currency: ranked.currency,
          sourceType: ranked.sourceType,
          sourceId: ranked.sourceId,
          reversalOfEntryId: ranked.reversalOfEntryId,
          reasonCode: ranked.reasonCode,
          reason: ranked.reason,
          transactionTime: ranked.transactionTime,
          recordedAt: ranked.recordedAt,
          actorId: ranked.actorId,
          commandId: ranked.commandId,
          runningBalanceMinor: ranked.runningBalanceMinor,
          saleTotalMinor: sales.totalAmountMinor,
          saleTransactionTime: sales.transactionTime,
          voidSaleId: saleVoids.saleId,
          voidReasonCode: saleVoids.reasonCode,
          paymentMethod: payments.method,
          reversalPaymentId: paymentReversals.paymentId,
          reversalAmountMinor: paymentReversals.amountMinor,
        })
        .from(ranked)
        // One LEFT JOIN per source kind, resolved in the page query. The
        // alternative is a lookup per entry, which is the N+1 this port forbids.
        .leftJoin(sales, eq(sales.id, ranked.sourceId))
        .leftJoin(saleVoids, eq(saleVoids.id, ranked.sourceId))
        .leftJoin(payments, eq(payments.id, ranked.sourceId))
        .leftJoin(paymentReversals, eq(paymentReversals.id, ranked.sourceId))
        .where(and(...filters))
        .orderBy(desc(ranked.transactionTime), desc(ranked.recordedAt), desc(ranked.id))
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
            document: sourceDocument(row),
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
        (row) => ({ sortValue: `${row.transactionTime}|${row.recordedAt}`, id: row.id }),
      );
    },

    async sourceObservations(args: { workspaceId: string; customerId: string }) {
      const postingSale = alias(sales, "reconciliation_posting_sale");
      const voidRecord = alias(saleVoids, "reconciliation_sale_void");
      const voidSale = alias(sales, "reconciliation_void_sale");
      const sourcePayment = alias(payments, "reconciliation_payment");
      const reversal = alias(paymentReversals, "reconciliation_payment_reversal");
      const reversedPayment = alias(payments, "reconciliation_reversed_payment");
      const reversalTarget = alias(customerAccountEntries, "reconciliation_reversal_target");

      const rows = await tx
        .select({
          entryId: customerAccountEntries.id,
          sourceType: customerAccountEntries.sourceType,
          sourceId: customerAccountEntries.sourceId,
          sourceExists: sql<boolean>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.id} IS NOT NULL
              WHEN 'sale_void' THEN ${voidRecord.id} IS NOT NULL
              WHEN 'payment' THEN ${sourcePayment.id} IS NOT NULL
              WHEN 'payment_reversal' THEN ${reversal.id} IS NOT NULL
              WHEN 'manual_adjustment' THEN true
              ELSE false
            END`,
          sourceWorkspaceId: sql<string | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.workspaceId}
              WHEN 'sale_void' THEN ${voidRecord.workspaceId}
              WHEN 'payment' THEN ${sourcePayment.workspaceId}
              WHEN 'payment_reversal' THEN ${reversal.workspaceId}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.workspaceId}
              ELSE NULL
            END`,
          sourceCustomerId: sql<string | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.customerId}
              WHEN 'sale_void' THEN ${voidSale.customerId}
              WHEN 'payment' THEN ${sourcePayment.customerId}
              WHEN 'payment_reversal' THEN ${reversedPayment.customerId}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.customerId}
              ELSE NULL
            END`,
          expectedAmountMinor: sql<number | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.totalAmountMinor}
              WHEN 'sale_void' THEN -${voidRecord.amountMinor}
              WHEN 'payment' THEN -${sourcePayment.amountMinor}
              WHEN 'payment_reversal' THEN ${reversal.amountMinor}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.amountMinor}
              ELSE NULL
            END`,
          expectedCurrency: sql<"VND" | null>`CASE ${customerAccountEntries.sourceType}
              WHEN 'sale_posting' THEN ${postingSale.currency}
              WHEN 'sale_void' THEN ${voidRecord.currency}
              WHEN 'payment' THEN ${sourcePayment.currency}
              WHEN 'payment_reversal' THEN ${reversal.currency}
              WHEN 'manual_adjustment' THEN ${customerAccountEntries.currency}
              ELSE NULL
            END`,
          reversalOfEntryId: customerAccountEntries.reversalOfEntryId,
          reversalTargetId: reversalTarget.id,
        })
        .from(customerAccountEntries)
        .leftJoin(postingSale, eq(postingSale.id, customerAccountEntries.sourceId))
        .leftJoin(voidRecord, eq(voidRecord.id, customerAccountEntries.sourceId))
        .leftJoin(voidSale, eq(voidSale.id, voidRecord.saleId))
        .leftJoin(sourcePayment, eq(sourcePayment.id, customerAccountEntries.sourceId))
        .leftJoin(reversal, eq(reversal.id, customerAccountEntries.sourceId))
        .leftJoin(reversedPayment, eq(reversedPayment.id, reversal.paymentId))
        .leftJoin(reversalTarget, eq(reversalTarget.id, customerAccountEntries.reversalOfEntryId))
        .where(
          and(
            eq(customerAccountEntries.workspaceId, args.workspaceId),
            eq(customerAccountEntries.customerId, args.customerId),
          ),
        )
        .orderBy(
          asc(customerAccountEntries.transactionTime),
          asc(customerAccountEntries.recordedAt),
          asc(customerAccountEntries.id),
        );

      return rows.map((row) => ({
        entryId: row.entryId,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceExists: row.sourceExists,
        sourceWorkspaceId: row.sourceWorkspaceId,
        sourceCustomerId: row.sourceCustomerId,
        expectedAmount:
          row.expectedAmountMinor === null || row.expectedCurrency === null
            ? null
            : money(Number(row.expectedAmountMinor), row.expectedCurrency),
        reversalTargetExists: row.reversalOfEntryId === null || row.reversalTargetId !== null,
      }));
    },
  },
});
