import type { CustomerOrderId, CustomerOrderStatus, CustomerId } from "@vuarau/domain-contracts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { recordDisplayReference, type CustomerOrderSummaryDto } from "@vuarau/domain-contracts";
import { customerOrderCapabilities } from "@vuarau/domain-kernel";
import { customers, customerOrderLines, customerOrders } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { loadCustomerOrder, mapCustomerOrderRows } from "../shared/customer-order-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createCustomerOrderReadRepositories = (tx: Tx) => ({
  customerOrderReads: {
    get: (workspaceId: string, customerOrderId: CustomerOrderId) =>
      loadCustomerOrder(tx, workspaceId, customerOrderId),
    async list(args: {
      workspaceId: string;
      customerId: CustomerId | null;
      status: CustomerOrderStatus | null;
      query: string;
      channel?: "account_customer" | "walk_in" | "contract_customer" | "internal_transfer" | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(customerOrders.workspaceId, args.workspaceId)];
      if (args.customerId !== null) filters.push(eq(customerOrders.customerId, args.customerId));
      if (args.status !== null) filters.push(eq(customerOrders.status, args.status));
      if (args.query.length > 0) {
        const pattern = `%${args.query}%`;
        const referencePattern = `%${args.query.replace(/^[A-Z]{2,4}-/i, "")}%`;
        filters.push(sql`(
          ${customerOrders.id}::text ILIKE ${referencePattern}
          OR EXISTS (
            SELECT 1 FROM ${customers} search_customers
            WHERE search_customers.workspace_id = ${customerOrders.workspaceId}
              AND search_customers.id = ${customerOrders.customerId}
              AND vuarau_fold(search_customers.display_name) ILIKE vuarau_fold(${pattern})
          )
          OR EXISTS (
            SELECT 1 FROM ${customerOrderLines} search_lines
            WHERE search_lines.workspace_id = ${customerOrders.workspaceId}
              AND search_lines.customer_order_id = ${customerOrders.id}
              AND vuarau_fold(search_lines.product_name) ILIKE vuarau_fold(${pattern})
          )
        )`);
      }
      if (args.channel !== undefined && args.channel !== null)
        filters.push(eq(customerOrders.channel, args.channel));
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${customerOrders.transactionTime}, ${customerOrders.recordedAt}, ${customerOrders.id})
          < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(customerOrders)
        .where(and(...filters))
        .orderBy(
          desc(customerOrders.transactionTime),
          desc(customerOrders.recordedAt),
          desc(customerOrders.id),
        )
        .limit(fetchLimit(args.page));
      const ids = rows.map((row) => row.id);
      const lines =
        ids.length === 0
          ? []
          : await tx
              .select()
              .from(customerOrderLines)
              .where(
                and(
                  eq(customerOrderLines.workspaceId, args.workspaceId),
                  inArray(customerOrderLines.customerOrderId, ids),
                ),
              );
      const customerRows =
        rows.length === 0
          ? []
          : await tx
              .select({ id: customers.id, displayName: customers.displayName })
              .from(customers)
              .where(
                and(
                  eq(customers.workspaceId, args.workspaceId),
                  inArray(
                    customers.id,
                    rows.map((row) => row.customerId).filter((id): id is string => id !== null),
                  ),
                ),
              );
      const customerNames = new Map(customerRows.map((row) => [row.id, row.displayName]));
      const mapped = mapCustomerOrderRows(rows, lines).map((row): CustomerOrderSummaryDto => ({
        ...row,
        evidenceReferences: [...row.evidenceReferences],
        lines: row.lines.map((line) => ({ ...line })),
        displayReference: recordDisplayReference("customerOrder", row.id),
        customerDisplayName:
          row.customerId === null ? null : (customerNames.get(row.customerId) ?? null),
        primaryProductName: row.lines[0]?.productName ?? null,
        primaryQuantity: row.lines[0]?.quantity ?? null,
        lineCount: row.lines.length,
        capabilities: customerOrderCapabilities(row),
      }));
      return paged(mapped, args.page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
