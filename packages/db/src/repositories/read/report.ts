import { and, eq, sql } from "drizzle-orm";
import {
  customerAccountBalances,
  customers,
  products,
  suppliers,
  supplierAccountBalances,
  inventoryBalances,
  qualityGrades,
  cashAccounts,
  cashBalances,
  cashMovements,
  expenses,
  expenseReversals,
} from "../../schema/index.ts";
import type { inventoryMovements } from "../../schema/index.ts";
import { classifyInventory } from "@vuarau/domain-kernel";
import { encodeCursor, vietnamBusinessDayRange, type ReportType } from "@vuarau/domain-contracts";
import { money, toIsoOrNull } from "../row-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";
import { customerActivityAtScale, inventoryMovementReportAtScale } from "./report-scale.ts";

export const createReportReadRepositories = (tx: Tx) => ({
  reportReads: {
    async operational(args: {
      workspaceId: string;
      reportType: ReportType;
      businessDate: string | null;
      businessDayStartMinute?: number;
      productId: string | null;
      unit: typeof inventoryMovements.$inferSelect.unit | null;
      page: Page;
    }) {
      if (args.reportType === "customer_account_activity") {
        return customerActivityAtScale(tx, { ...args, businessDayStartMinute: args.businessDayStartMinute ?? 0 });
      }
      if (args.reportType === "inventory_movement_report") {
        return inventoryMovementReportAtScale(tx, { ...args, businessDayStartMinute: args.businessDayStartMinute ?? 0 });
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
      } else if (args.reportType === "cash_balances") {
        const values = await tx
          .select({ account: cashAccounts, balance: cashBalances })
          .from(cashAccounts)
          .leftJoin(
            cashBalances,
            and(
              eq(cashBalances.workspaceId, cashAccounts.workspaceId),
              eq(cashBalances.cashAccountId, cashAccounts.id),
            ),
          )
          .where(eq(cashAccounts.workspaceId, args.workspaceId));
        rows = values.map(({ account, balance }) => ({
          id: account.id,
          label: account.displayName,
          sourceType: "cash_account",
          sourceId: account.id,
          documentHref: `/cash/accounts/${account.id}`,
          transactionTime: toIsoOrNull(balance?.lastMovementTransactionTime ?? null),
          amount: money(balance?.balanceMinor ?? 0, account.currency),
          quantity: null,
          status: account.isActive ? "active" : "inactive",
        }));
      } else if (args.reportType === "cash_movement_report") {
        const filters = [eq(cashMovements.workspaceId, args.workspaceId)];
        if (args.businessDate !== null) {
          const range = vietnamBusinessDayRange(
            args.businessDate,
            args.businessDayStartMinute ?? 0,
          );
          filters.push(sql`${cashMovements.transactionTime} >= ${range.start}::timestamptz`);
          filters.push(sql`${cashMovements.transactionTime} < ${range.end}::timestamptz`);
        }
        const values = await tx
          .select({ movement: cashMovements, account: cashAccounts })
          .from(cashMovements)
          .innerJoin(
            cashAccounts,
            and(
              eq(cashAccounts.workspaceId, cashMovements.workspaceId),
              eq(cashAccounts.id, cashMovements.cashAccountId),
            ),
          )
          .where(and(...filters));
        rows = values.map(({ movement, account }) => ({
          id: movement.id,
          label: `${account.displayName} · ${movement.sourceType}`,
          sourceType: movement.sourceType,
          sourceId: movement.sourceId,
          documentHref: `/cash/accounts/${account.id}`,
          transactionTime: toIsoOrNull(movement.transactionTime),
          amount: money(movement.amountMinor, movement.currency),
          quantity: null,
          status: movement.amountMinor >= 0 ? "cash_in" : "cash_out",
        }));
      } else if (args.reportType === "expense_report") {
        const filters = [eq(expenses.workspaceId, args.workspaceId)];
        if (args.businessDate !== null) {
          const range = vietnamBusinessDayRange(
            args.businessDate,
            args.businessDayStartMinute ?? 0,
          );
          filters.push(sql`${expenses.transactionTime} >= ${range.start}::timestamptz`);
          filters.push(sql`${expenses.transactionTime} < ${range.end}::timestamptz`);
        }
        const values = await tx
          .select({ expense: expenses, reversal: expenseReversals, account: cashAccounts })
          .from(expenses)
          .innerJoin(
            cashAccounts,
            and(
              eq(cashAccounts.workspaceId, expenses.workspaceId),
              eq(cashAccounts.id, expenses.cashAccountId),
            ),
          )
          .leftJoin(
            expenseReversals,
            and(
              eq(expenseReversals.workspaceId, expenses.workspaceId),
              eq(expenseReversals.expenseId, expenses.id),
            ),
          )
          .where(and(...filters));
        rows = values
          .filter(({ reversal }) => reversal === null)
          .map(({ expense, account }) => ({
            id: expense.id,
            label: `${expense.category} · ${account.displayName}`,
            sourceType: "expense",
            sourceId: expense.id,
            documentHref: `/cash/expenses/${expense.id}`,
            transactionTime: toIsoOrNull(expense.transactionTime),
            amount: money(expense.amountMinor, expense.currency),
            quantity: null,
            status: "expense",
          }));
      } else if (args.reportType === "inventory_by_product_unit") {
        const filters = [eq(inventoryBalances.workspaceId, args.workspaceId)];
        if (args.productId !== null) filters.push(eq(inventoryBalances.productId, args.productId));
        if (args.unit !== null) filters.push(eq(inventoryBalances.unit, args.unit));
        const values = await tx
          .select({ balance: inventoryBalances, product: products, grade: qualityGrades })
          .from(inventoryBalances)
          .innerJoin(
            products,
            and(
              eq(products.workspaceId, inventoryBalances.workspaceId),
              eq(products.id, inventoryBalances.productId),
            ),
          )
          .leftJoin(
            qualityGrades,
            and(
              eq(qualityGrades.workspaceId, inventoryBalances.workspaceId),
              eq(qualityGrades.id, inventoryBalances.qualityGradeId),
            ),
          )
          .where(and(...filters));
        rows = values.map(({ balance, product, grade }) => ({
          id: `${product.id}:${balance.qualityGradeId ?? "legacy"}:${balance.unit}`,
          label: `${product.name} · ${grade?.name ?? "Chưa phân hạng"} · ${balance.unit}`,
          productId: product.id,
          productName: product.name,
          qualityGradeId: balance.qualityGradeId,
          qualityGradeName: grade?.name ?? null,
          sourceType: "product",
          sourceId: product.id,
          documentHref: `/products/${product.id}/inventory`,
          transactionTime: toIsoOrNull(balance.lastMovementTransactionTime),
          amount: null,
          quantity: { valueScaled: balance.quantityScaled, unit: balance.unit },
          status: classifyInventory(balance.quantityScaled),
        }));
      } else if (args.reportType === "outstanding_delivery") {
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
