import type { Repositories } from "../../ports.ts";
import { money } from "@vuarau/domain-kernel";
import { key, ascendingBy, before, takePage, sourceDocument } from "../store.ts";
import type { Store } from "../store.ts";

export const createAccountReads = (store: Store): Pick<Repositories, "accountReads"> => ({
  accountReads: {
    adjustmentDetail: async ({ workspaceId, adjustmentId }) => {
      const entry = store.accountEntries.find(
        (item) =>
          item.workspaceId === workspaceId &&
          item.sourceType === "manual_adjustment" &&
          item.sourceId === adjustmentId,
      );
      if (entry === undefined) return { kind: "not_found" as const };
      if (
        entry.amount.amountMinor === 0 ||
        entry.reasonCode === null ||
        entry.reason === null ||
        entry.reason.trim().length === 0
      )
        return { kind: "integrity_error" as const, reason: "missing adjustment fields" };
      const history = store.accountEntries
        .filter((item) => item.workspaceId === workspaceId && item.customerId === entry.customerId)
        .sort(
          ascendingBy(
            (item) => `${item.transactionTime}:${item.recordedAt}`,
            (item) => item.id,
          ),
        );
      let running = 0;
      for (const item of history) {
        running += item.amount.amountMinor;
        if (item.id === entry.id) break;
      }
      const customer = store.customers.get(key(workspaceId, entry.customerId));
      const workspace = store.workspaceNames.get(workspaceId);
      const actor = store.actorNames.get(entry.actorId);
      if (customer === undefined || workspace === undefined || actor === undefined)
        return { kind: "integrity_error" as const, reason: "missing joined record" };
      return {
        kind: "found" as const,
        row: {
          adjustmentId,
          entryId: entry.id,
          commandId: entry.commandId,
          workspace: { id: workspaceId, name: workspace },
          customer: { id: entry.customerId, displayName: customer.displayName },
          actor: { id: entry.actorId, displayName: actor },
          amount: entry.amount,
          reasonCode: entry.reasonCode,
          reason: entry.reason,
          transactionTime: entry.transactionTime,
          recordedAt: entry.recordedAt,
          runningBalance: money(running, entry.amount.currency),
        },
      };
    },
    timeline: async ({ workspaceId, customerId, from, to, page }) => {
      // The running balance is computed over the customer's whole history in
      // business-time order, then the page is cut out of it — the same thing
      // the SQL window function does, and for the same reason: a page is a
      // slice, and a slice cannot know what came before it.
      const ascending = store.accountEntries
        .filter((entry) => entry.workspaceId === workspaceId && entry.customerId === customerId)
        .sort(
          ascendingBy(
            (entry) => `${entry.transactionTime}|${entry.recordedAt}`,
            (entry) => entry.id,
          ),
        );

      let running = 0;
      const withBalance = ascending.map((entry) => {
        running += entry.amount.amountMinor;
        return { entry, runningBalance: money(running, entry.amount.currency) };
      });

      const matched = withBalance
        .filter(({ entry }) => from === null || entry.transactionTime >= from)
        .filter(({ entry }) => to === null || entry.transactionTime <= to)
        .reverse()
        .filter(({ entry }) =>
          page.after === null
            ? true
            : before(
                [`${entry.transactionTime}|${entry.recordedAt}`, entry.id],
                [page.after.sortValue, page.after.id],
              ),
        )
        .map(({ entry, runningBalance }) => ({
          id: entry.id,
          workspaceId: entry.workspaceId,
          customerId: entry.customerId,
          amount: entry.amount,
          runningBalance,
          source: {
            type: entry.sourceType,
            id: entry.sourceId,
            document: sourceDocument(store, entry.sourceType, entry.sourceId),
            label: entry.sourceType,
          },
          reversalOfEntryId: entry.reversalOfEntryId,
          reasonCode: entry.reasonCode,
          reason: entry.reason,
          transactionTime: entry.transactionTime,
          recordedAt: entry.recordedAt,
          actorId: entry.actorId,
          commandId: entry.commandId,
        }));

      return takePage(matched, page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
    sourceObservations: async ({ workspaceId, customerId }) =>
      store.accountEntries
        .filter((entry) => entry.workspaceId === workspaceId && entry.customerId === customerId)
        .sort(
          ascendingBy(
            (entry) => `${entry.transactionTime}|${entry.recordedAt}`,
            (entry) => entry.id,
          ),
        )
        .map((entry) => {
          const reversalTargetExists =
            entry.reversalOfEntryId === null ||
            store.accountEntries.some((candidate) => candidate.id === entry.reversalOfEntryId);
          if (entry.sourceType === "manual_adjustment") {
            return {
              entryId: entry.id,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              sourceExists: true,
              sourceWorkspaceId: entry.workspaceId,
              sourceCustomerId: entry.customerId,
              expectedAmount: entry.amount,
              reversalTargetExists,
            };
          }
          if (entry.sourceType === "sale_posting") {
            const sale = [...store.sales.values()].find((item) => item.id === entry.sourceId);
            return {
              entryId: entry.id,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              sourceExists: sale !== undefined,
              sourceWorkspaceId: sale?.workspaceId ?? null,
              sourceCustomerId: sale?.customerId ?? null,
              expectedAmount: sale?.totalAmount ?? null,
              reversalTargetExists,
            };
          }
          if (entry.sourceType === "sale_void") {
            const voidRecord = store.saleVoids.find((item) => item.id === entry.sourceId);
            const sale =
              voidRecord === undefined
                ? undefined
                : [...store.sales.values()].find((item) => item.id === voidRecord.saleId);
            return {
              entryId: entry.id,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              sourceExists: voidRecord !== undefined,
              sourceWorkspaceId: voidRecord?.workspaceId ?? null,
              sourceCustomerId: sale?.customerId ?? null,
              expectedAmount:
                voidRecord === undefined
                  ? null
                  : money(-voidRecord.amount.amountMinor, voidRecord.amount.currency),
              reversalTargetExists,
            };
          }
          if (entry.sourceType === "payment") {
            const payment = [...store.payments.values()].find((item) => item.id === entry.sourceId);
            return {
              entryId: entry.id,
              sourceType: entry.sourceType,
              sourceId: entry.sourceId,
              sourceExists: payment !== undefined,
              sourceWorkspaceId: payment?.workspaceId ?? null,
              sourceCustomerId: payment?.customerId ?? null,
              expectedAmount:
                payment === undefined
                  ? null
                  : money(-payment.amount.amountMinor, payment.amount.currency),
              reversalTargetExists,
            };
          }
          const reversal = store.reversals.find((item) => item.id === entry.sourceId);
          const payment =
            reversal === undefined
              ? undefined
              : [...store.payments.values()].find((item) => item.id === reversal.paymentId);
          return {
            entryId: entry.id,
            sourceType: entry.sourceType,
            sourceId: entry.sourceId,
            sourceExists: reversal !== undefined,
            sourceWorkspaceId: reversal?.workspaceId ?? null,
            sourceCustomerId: payment?.customerId ?? null,
            expectedAmount: reversal?.amount ?? null,
            reversalTargetExists,
          };
        }),
    debtAgingSources: async ({ workspaceId, customerId, asOf }) => ({
      sales: [...store.sales.values()]
        .filter(
          (sale) =>
            sale.workspaceId === workspaceId &&
            sale.customerId === customerId &&
            sale.status === "posted" &&
            sale.voidRecord === null &&
            sale.transactionTime <= asOf,
        )
        .map((sale) => ({
          saleId: sale.id,
          customerId: sale.customerId,
          amount: sale.totalAmount,
          transactionTime: sale.transactionTime,
          dueAt: sale.dueAt,
        })),
      payments: [...store.payments.values()]
        .filter(
          (payment) =>
            payment.workspaceId === workspaceId &&
            payment.customerId === customerId &&
            payment.transactionTime <= asOf,
        )
        .map((payment) => ({
          paymentId: payment.id,
          customerId: payment.customerId,
          amount: payment.amount,
          reversals: store.reversals
            .filter(
              (reversal) =>
                reversal.workspaceId === workspaceId && reversal.paymentId === payment.id,
            )
            .map((reversal) => ({
              amount: reversal.amount,
              transactionTime: reversal.transactionTime,
            })),
          transactionTime: payment.transactionTime,
        })),
      ledgerEntries: store.accountEntries
        .filter(
          (entry) =>
            entry.workspaceId === workspaceId &&
            entry.customerId === customerId &&
            entry.transactionTime <= asOf,
        )
        .map((entry) => ({
          entryId: entry.id,
          sourceType: entry.sourceType,
          sourceId: entry.sourceId,
          customerId: entry.customerId,
          amount: entry.amount,
          transactionTime: entry.transactionTime,
        })),
      allocations: store.paymentAllocations
        .filter(
          (allocation) =>
            allocation.workspaceId === workspaceId &&
            allocation.customerId === customerId &&
            allocation.transactionTime <= asOf,
        )
        .map((allocation) => ({
          allocationId: allocation.id,
          customerId: allocation.customerId,
          paymentId: allocation.paymentId,
          saleId: allocation.saleId,
          amount: allocation.amount,
          transactionTime: allocation.transactionTime,
        })),
      allocationReversals: store.paymentAllocationReversals
        .filter(
          (reversal) =>
            reversal.workspaceId === workspaceId &&
            reversal.customerId === customerId &&
            reversal.transactionTime <= asOf,
        )
        .map((reversal) => ({
          reversalId: reversal.id,
          allocationId: reversal.allocationId,
          customerId: reversal.customerId,
          amount: reversal.amount,
          transactionTime: reversal.transactionTime,
        })),
    }),
  },
});
