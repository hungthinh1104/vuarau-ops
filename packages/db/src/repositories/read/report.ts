import { and, eq, sql } from "drizzle-orm";
import {
  customerAccountBalances,
  customers,
  products,
  suppliers,
  supplierAccountBalances,
  inventoryBalances,
} from "../../schema/index.ts";
import type { inventoryMovements } from "../../schema/index.ts";
import { classifyInventory } from "@vuarau/domain-kernel";
import { encodeCursor } from "@vuarau/domain-contracts";
import { money, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";
import { customerActivityAtScale, inventoryMovementReportAtScale } from "./report-scale.ts";

export const createReportReadRepositories = (tx: Tx) => ({
  reportReads: {
    async operational(args: {
      workspaceId: string;
      reportType:
        | "customer_account_activity"
        | "customer_receivables"
        | "supplier_payables"
        | "inventory_by_product_unit"
        | "inventory_movement_report"
        | "outstanding_delivery";
      businessDate: string | null;
      productId: string | null;
      unit: typeof inventoryMovements.$inferSelect.unit | null;
      page: Page;
    }) {
      if (args.reportType === "customer_account_activity") {
        return customerActivityAtScale(tx, args);
      }
      if (args.reportType === "inventory_movement_report") {
        return inventoryMovementReportAtScale(tx, args);
      }
      type Row = {
        id: string;
        label: string;
        sourceType: string;
        sourceId: string;
        documentHref: string | null;
        transactionTime: string | null;
        amount: { amountMinor: number; currency: "VND" } | null;
        quantity: {
          valueScaled: number;
          unit: typeof inventoryMovements.$inferSelect.unit;
        } | null;
        status: string;
      };
      let rows: Row[] = [];
      const diagnostics: string[] = [];
      if (args.reportType === "customer_receivables") {
        const values = await tx
          .select({ balance: customerAccountBalances, customer: customers })
          .from(customerAccountBalances)
          .innerJoin(
            customers,
            and(
              eq(customers.workspaceId, customerAccountBalances.workspaceId),
              eq(customers.id, customerAccountBalances.customerId),
            ),
          )
          .where(eq(customerAccountBalances.workspaceId, args.workspaceId));
        rows = values
          .filter((value) => value.balance.balanceMinor > 0)
          .map(({ balance, customer }) => ({
            id: customer.id,
            label: customer.displayName,
            sourceType: "customer",
            sourceId: customer.id,
            documentHref: `/customers/${customer.id}`,
            transactionTime: toIsoOrNull(balance.lastEntryTransactionTime),
            amount: money(balance.balanceMinor, balance.currency),
            quantity: null,
            status: "receivable",
          }));
      } else if (args.reportType === "supplier_payables") {
        const values = await tx
          .select({ balance: supplierAccountBalances, supplier: suppliers })
          .from(supplierAccountBalances)
          .innerJoin(
            suppliers,
            and(
              eq(suppliers.workspaceId, supplierAccountBalances.workspaceId),
              eq(suppliers.id, supplierAccountBalances.supplierId),
            ),
          )
          .where(eq(supplierAccountBalances.workspaceId, args.workspaceId));
        rows = values
          .filter((value) => value.balance.balanceMinor > 0)
          .map(({ balance, supplier }) => ({
            id: supplier.id,
            label: supplier.displayName,
            sourceType: "supplier",
            sourceId: supplier.id,
            documentHref: `/suppliers/${supplier.id}`,
            transactionTime: toIsoOrNull(balance.lastEntryTransactionTime),
            amount: money(balance.balanceMinor, balance.currency),
            quantity: null,
            status: "payable",
          }));
      } else if (args.reportType === "inventory_by_product_unit") {
        const filters = [eq(inventoryBalances.workspaceId, args.workspaceId)];
        if (args.productId !== null) filters.push(eq(inventoryBalances.productId, args.productId));
        if (args.unit !== null) filters.push(eq(inventoryBalances.unit, args.unit));
        const values = await tx
          .select({ balance: inventoryBalances, product: products })
          .from(inventoryBalances)
          .innerJoin(
            products,
            and(
              eq(products.workspaceId, inventoryBalances.workspaceId),
              eq(products.id, inventoryBalances.productId),
            ),
          )
          .where(and(...filters));
        rows = values.map(({ balance, product }) => ({
          id: `${product.id}:${balance.unit}`,
          label: `${product.name} · ${balance.unit}`,
          sourceType: "product",
          sourceId: product.id,
          documentHref: `/products/${product.id}/inventory`,
          transactionTime: toIsoOrNull(balance.lastMovementTransactionTime),
          amount: null,
          quantity: { valueScaled: balance.quantityScaled, unit: balance.unit },
          status: classifyInventory(balance.quantityScaled),
        }));
      } else {
        const values = await tx.execute(sql`
            with dispatched as (
              select dl.sale_line_id, sum(dl.quantity_scaled)::bigint quantity
              from delivery_lines dl
              join deliveries d
                on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
              where d.workspace_id=${args.workspaceId}::uuid
                and d.status in ('dispatched','delivered')
              group by dl.sale_line_id
            ), returned as (
              select dl.sale_line_id, sum(drl.quantity_scaled)::bigint quantity
              from delivery_return_lines drl
              join delivery_returns dr on dr.id=drl.return_id
              join delivery_lines dl on dl.id=drl.delivery_line_id
              where dr.workspace_id=${args.workspaceId}::uuid
              group by dl.sale_line_id
            )
            select s.id as sale_id, c.display_name,
              sl.id as sale_line_id, sl.product_name, sl.quantity_scaled, sl.unit,
              (coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0))::bigint
                as net_fulfilled
            from sales s
            join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
            join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
            left join dispatched on dispatched.sale_line_id=sl.id
            left join returned on returned.sale_line_id=sl.id
            where s.workspace_id=${args.workspaceId}::uuid and s.status='posted'
          `);
        rows = values.flatMap((value) => {
          const ordered = Number(value["quantity_scaled"]);
          const net = Number(value["net_fulfilled"]);
          return ordered - net <= 0
            ? []
            : [
                {
                  id: String(value["sale_line_id"]),
                  label: `${String(value["display_name"])} · ${String(value["product_name"])}`,
                  sourceType: "sale",
                  sourceId: String(value["sale_id"]),
                  documentHref: `/sales/${String(value["sale_id"])}`,
                  transactionTime: null,
                  amount: null,
                  quantity: {
                    valueScaled: ordered - net,
                    unit: value["unit"] as typeof inventoryMovements.$inferSelect.unit,
                  },
                  status: "outstanding",
                },
              ];
        });
      }
      rows.sort((a, b) => {
        const aKey = `${a.transactionTime ?? ""}|${a.id}`;
        const bKey = `${b.transactionTime ?? ""}|${b.id}`;
        return aKey < bKey ? 1 : aKey > bKey ? -1 : 0;
      });
      const allRows = rows;
      if (args.page.after !== null) {
        const boundary = `${args.page.after.sortValue}|${args.page.after.id}`;
        rows = rows.filter((row) => `${row.transactionTime ?? ""}|${row.id}` < boundary);
      }
      const visible = rows.slice(0, args.page.limit);
      const next =
        rows.length <= args.page.limit || visible.length === 0
          ? null
          : {
              sortValue: visible[visible.length - 1]!.transactionTime ?? "",
              id: visible[visible.length - 1]!.id,
            };
      const amountRows = allRows.flatMap((row) => (row.amount === null ? [] : [row.amount]));
      const quantityTotals = new Map<string, number>();
      for (const row of allRows) {
        if (row.quantity !== null)
          quantityTotals.set(
            row.quantity.unit,
            (quantityTotals.get(row.quantity.unit) ?? 0) + row.quantity.valueScaled,
          );
      }
      return {
        reportType: args.reportType,
        businessDate: args.businessDate,
        timezone: "Asia/Ho_Chi_Minh" as const,
        integrity: diagnostics.length === 0 ? ("healthy" as const) : ("attention" as const),
        diagnostics,
        totals: {
          amount:
            amountRows.length === 0
              ? null
              : money(
                  amountRows.reduce((sum, amount) => sum + amount.amountMinor, 0),
                  "VND",
                ),
          quantities: [...quantityTotals.entries()].map(([unit, valueScaled]) => ({
            unit: unit as typeof inventoryMovements.$inferSelect.unit,
            valueScaled,
          })),
        },
        page: {
          items: visible,
          nextCursor: next === null ? null : encodeCursor(next),
        },
      };
    },
  },
});
