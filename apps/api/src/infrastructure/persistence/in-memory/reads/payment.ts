import type { Repositories } from "../../ports.ts";
import { key, descendingBy, after, before, takePage, toPaymentSummaryRow } from "../store.ts";
import type { Store } from "../store.ts";

export const createPaymentReads = (store: Store): Pick<Repositories, "paymentReads"> => ({
  paymentReads: {
    get: async (workspaceId, paymentId) => {
      const payment = store.payments.get(key(workspaceId, paymentId));
      return payment === undefined ? null : toPaymentSummaryRow(store, payment);
    },

    list: async ({ workspaceId, customerId, status, from, to, page }) => {
      const matched = [...store.payments.values()]
        .filter((payment) => payment.workspaceId === workspaceId)
        .filter((payment) => customerId === null || payment.customerId === customerId)
        .filter((payment) => status === null || payment.status === status)
        .filter((payment) => from === null || payment.transactionTime >= from)
        .filter((payment) => to === null || payment.transactionTime <= to)
        .sort(
          descendingBy(
            (payment) => payment.transactionTime,
            (payment) => payment.id,
          ),
        )
        .filter((payment) =>
          page.after === null
            ? true
            : before([payment.transactionTime, payment.id], [page.after.sortValue, page.after.id]),
        )
        .map((payment) => toPaymentSummaryRow(store, payment));

      return takePage(matched, page, (row) => ({
        sortValue: row.transactionTime,
        id: row.id,
      }));
    },
  },
});
