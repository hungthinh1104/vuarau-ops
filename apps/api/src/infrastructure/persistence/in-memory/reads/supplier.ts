import type { Repositories } from "../../ports.ts";
import { key, ascendingBy, after, takePage, fold } from "../store.ts";
import type { Store } from "../store.ts";

export const createSupplierReads = (
  store: Store,
): Pick<Repositories, "supplierReads" | "supplierAccountReads"> => ({
  supplierReads: {
    search: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.suppliers.values()]
        .filter((supplier) => supplier.workspaceId === workspaceId)
        .filter((supplier) => isActive === null || supplier.isActive === isActive)
        .filter(
          (supplier) =>
            needle.length === 0 ||
            fold(supplier.displayName).includes(needle) ||
            (supplier.phone ?? "").includes(query),
        )
        .sort(
          ascendingBy(
            (supplier) => supplier.displayName,
            (supplier) => supplier.id,
          ),
        )
        .filter((supplier) =>
          page.after === null
            ? true
            : after([supplier.displayName, supplier.id], [page.after.sortValue, page.after.id]),
        );
      return takePage(rows, page, (row) => ({
        sortValue: row.displayName,
        id: row.id,
      }));
    },
    get: async (workspaceId, supplierId) =>
      store.suppliers.get(key(workspaceId, supplierId)) ?? null,
  },
  supplierAccountReads: {
    balance: async (workspaceId, supplierId) => {
      const row = store.supplierAccountBalances.get(key(workspaceId, supplierId));
      return row === undefined
        ? null
        : {
            ...row,
            classification:
              row.balance.amountMinor > 0
                ? "payable"
                : row.balance.amountMinor < 0
                  ? "supplier_credit"
                  : "settled",
          };
    },
    timeline: async ({ workspaceId, supplierId, page }) => {
      const rows = store.supplierAccountEntries
        .filter((entry) => entry.workspaceId === workspaceId && entry.supplierId === supplierId)
        .sort((a, b) =>
          a.transactionTime !== b.transactionTime
            ? b.transactionTime.localeCompare(a.transactionTime)
            : a.recordedAt !== b.recordedAt
              ? b.recordedAt.localeCompare(a.recordedAt)
              : b.id.localeCompare(a.id),
        )
        .filter((entry) => {
          if (page.after === null) return true;
          const sortValue = `${entry.transactionTime}|${entry.recordedAt}`;
          return (
            sortValue < page.after.sortValue ||
            (sortValue === page.after.sortValue && entry.id < page.after.id)
          );
        });
      return takePage(
        rows.map((row) => {
          const sourceDocument =
            row.sourceType === "supplier_payment"
              ? { type: "supplier_payment" as const, id: row.sourceId }
              : row.sourceType === "supplier_payment_reversal"
                ? {
                    type: "supplier_payment" as const,
                    id:
                      store.supplierPaymentReversals.find(
                        (reversal) => reversal.id === row.sourceId,
                      )?.supplierPaymentId ?? row.sourceId,
                  }
                : row.sourceType === "purchase_confirmation"
                  ? { type: "purchase" as const, id: row.sourceId }
                  : row.sourceType === "purchase_void"
                    ? {
                        type: "purchase" as const,
                        id:
                          [...store.purchases.values()].find(
                            (purchase) => purchase.voidRecord?.id === row.sourceId,
                          )?.id ?? row.sourceId,
                      }
                    : { type: "supplier_adjustment" as const, id: row.sourceId };
          return { ...row, sourceDocument };
        }),
        page,
        (row) => ({
          sortValue: `${row.transactionTime}|${row.recordedAt}`,
          id: row.id,
        }),
      );
    },
    payment: async (workspaceId, paymentId) => {
      const row = store.supplierPayments.get(key(workspaceId, paymentId));
      if (row === undefined) return null;
      return {
        ...row,
        status:
          row.reversedAmount.amountMinor === 0
            ? "recorded"
            : row.reversedAmount.amountMinor === row.amount.amountMinor
              ? "reversed"
              : "partially_reversed",
      };
    },
    integrity: async (workspaceId, supplierId) => {
      const diagnostics: string[] = [];
      for (const entry of store.supplierAccountEntries.filter(
        (row) => row.workspaceId === workspaceId && row.supplierId === supplierId,
      )) {
        if (entry.amount.amountMinor === 0) diagnostics.push("zero_amount");
        if (
          entry.sourceType === "manual_adjustment" &&
          (entry.reasonCode === null || (entry.reason ?? "").trim().length === 0)
        )
          diagnostics.push("malformed_adjustment");
        if (entry.sourceType === "supplier_payment") {
          const payment = store.supplierPayments.get(key(workspaceId, entry.sourceId));
          if (
            payment === undefined ||
            payment.supplierId !== supplierId ||
            -payment.amount.amountMinor !== entry.amount.amountMinor
          )
            diagnostics.push("missing_or_mismatched_supplier_payment");
        }
        if (entry.sourceType === "purchase_confirmation") {
          const purchase = store.purchases.get(key(workspaceId, entry.sourceId));
          if (
            purchase === undefined ||
            purchase.supplierId !== supplierId ||
            purchase.status !== "confirmed" ||
            purchase.totalAmount.amountMinor !== entry.amount.amountMinor
          )
            diagnostics.push("missing_or_mismatched_purchase");
        }
      }
      return diagnostics;
    },
  },
});
