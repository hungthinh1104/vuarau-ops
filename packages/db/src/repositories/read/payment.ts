import { and, desc, eq, gte, lte, sql, SQL } from "drizzle-orm";
import { payments } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged, paymentSelect, toPaymentSummary } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createPaymentReadRepositories = (tx: Tx) => ({
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
});
