import { and, eq, sql } from "drizzle-orm";
import {
  products,
  inventoryBalances,
  qualityGrades,
  cashAccounts,
  cashBalances,
  cashMovements,
  expenses,
  expenseReversals,
} from "../../schema/index.ts";
import type { inventoryMovements } from "../../schema/index.ts";
import { classifyInventory, sumMoneyExact } from "@vuarau/domain-kernel";
import {
  encodeCursor,
  vietnamBusinessDayRange,
  type OperationalReportDto,
  type ReportType,
} from "@vuarau/domain-contracts";
import { money, toIsoOrNull } from "../row-mappers.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import type { Page } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";
import {
  cashBalancesAtScale,
  cashMovementAtScale,
  customerActivityAtScale,
  expenseAtScale,
  inventoryBalancesAtScale,
  inventoryMovementReportAtScale,
  nextProjectionCursor,
} from "./report-scale.ts";

type ProjectionReportArgs = {
  readonly workspaceId: string;
  readonly businessDate: string | null;
  readonly businessDayStartMinute?: number;
  readonly productId: string | null;
  readonly unit: typeof inventoryMovements.$inferSelect.unit | null;
  readonly page: Page;
};

type ProjectionRow = OperationalReportDto["page"]["items"][number];

function projectionCursor(args: ProjectionReportArgs): { time: string | null; id: string } | null {
  if (args.page.after === null) return null;
  return {
    time: args.page.after.sortValue,
    id: args.page.after.id,
  };
}

async function customerReceivablesAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const cursor = projectionCursor(args);
  const cursorFilter =
    cursor === null
      ? sql``
      : cursor.time === ""
        ? sql`and b.last_entry_transaction_time is null and c.id < ${cursor.id}::uuid`
        : sql`and (coalesce(b.last_entry_transaction_time, '-infinity'::timestamptz), c.id)
            < (coalesce(${cursor.time}::timestamptz, '-infinity'::timestamptz), ${cursor.id}::uuid)`;
  const values = (await tx.execute(sql`
    select c.id, c.display_name, b.balance_minor, b.currency, b.last_entry_transaction_time
    from customer_account_balances b
    join customers c
      on c.workspace_id=b.workspace_id and c.id=b.customer_id
    where b.workspace_id=${args.workspaceId}::uuid and b.balance_minor > 0
      ${cursorFilter}
    order by coalesce(b.last_entry_transaction_time, '-infinity'::timestamptz) desc, c.id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const total = (
    await tx.execute(sql`
    select count(*)::int as count, coalesce(sum(balance_minor), 0) as amount
    from customer_account_balances
    where workspace_id=${args.workspaceId}::uuid and balance_minor > 0
  `)
  )[0] as Record<string, unknown> | undefined;
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => ({
    id: String(row["id"]),
    label: String(row["display_name"]),
    productId: null,
    productName: null,
    qualityGradeId: null,
    qualityGradeName: null,
    sourceType: "customer",
    sourceId: String(row["id"]),
    documentHref: `/customers/${String(row["id"])}`,
    transactionTime:
      row["last_entry_transaction_time"] === null
        ? null
        : new Date(String(row["last_entry_transaction_time"])).toISOString(),
    amount: money(
      persistedBigintToSafeNumber(row["balance_minor"], "customer receivable row amount"),
      String(row["currency"]) as "VND",
    ),
    quantity: null,
    status: "receivable",
  }));
  return {
    reportType: "customer_receivables",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: {
      amount: money(
        persistedBigintToSafeNumber(total?.["amount"] ?? 0, "customer receivable total"),
        "VND",
      ),
      quantities: [],
    },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "last_entry_transaction_time"),
    },
  };
}

async function supplierPayablesAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const cursor = projectionCursor(args);
  const cursorFilter =
    cursor === null
      ? sql``
      : cursor.time === ""
        ? sql`and b.last_entry_transaction_time is null and s.id < ${cursor.id}::uuid`
        : sql`and (coalesce(b.last_entry_transaction_time, '-infinity'::timestamptz), s.id)
            < (coalesce(${cursor.time}::timestamptz, '-infinity'::timestamptz), ${cursor.id}::uuid)`;
  const values = (await tx.execute(sql`
    select s.id, s.display_name, b.balance_minor, b.currency, b.last_entry_transaction_time
    from supplier_account_balances b
    join suppliers s
      on s.workspace_id=b.workspace_id and s.id=b.supplier_id
    where b.workspace_id=${args.workspaceId}::uuid and b.balance_minor > 0
      ${cursorFilter}
    order by coalesce(b.last_entry_transaction_time, '-infinity'::timestamptz) desc, s.id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const total = (
    await tx.execute(sql`
    select count(*)::int as count, coalesce(sum(balance_minor), 0) as amount
    from supplier_account_balances
    where workspace_id=${args.workspaceId}::uuid and balance_minor > 0
  `)
  )[0] as Record<string, unknown> | undefined;
  const items: ProjectionRow[] = values.slice(0, args.page.limit).map((row) => ({
    id: String(row["id"]),
    label: String(row["display_name"]),
    productId: null,
    productName: null,
    qualityGradeId: null,
    qualityGradeName: null,
    sourceType: "supplier",
    sourceId: String(row["id"]),
    documentHref: `/suppliers/${String(row["id"])}`,
    transactionTime:
      row["last_entry_transaction_time"] === null
        ? null
        : new Date(String(row["last_entry_transaction_time"])).toISOString(),
    amount: money(
      persistedBigintToSafeNumber(row["balance_minor"], "supplier payable row amount"),
      String(row["currency"]) as "VND",
    ),
    quantity: null,
    status: "payable",
  }));
  return {
    reportType: "supplier_payables",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: {
      amount: money(
        persistedBigintToSafeNumber(total?.["amount"] ?? 0, "supplier payable total"),
        "VND",
      ),
      quantities: [],
    },
    page: {
      items,
      nextCursor: nextProjectionCursor(values, args.page.limit, "last_entry_transaction_time"),
    },
  };
}

async function outstandingDeliveryAtScale(
  tx: Tx,
  args: ProjectionReportArgs,
): Promise<OperationalReportDto> {
  const after = args.page.after;
  const values = (await tx.execute(sql`
    with dispatched as (
      select dl.sale_line_id, sum(dl.quantity_scaled) as quantity
      from delivery_lines dl
      join deliveries d
        on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      where d.workspace_id=${args.workspaceId}::uuid
        and d.status in ('dispatched','delivered')
      group by dl.sale_line_id
    ), returned as (
      select dl.sale_line_id, sum(drl.quantity_scaled) as quantity
      from delivery_return_lines drl
      join delivery_returns dr
        on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
      join delivery_lines dl
        on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
      where dr.workspace_id=${args.workspaceId}::uuid
      group by dl.sale_line_id
    ), outstanding as (
      select s.id as sale_id, c.display_name, sl.id as sale_line_id,
        sl.product_name, sl.quantity_scaled, sl.unit,
        (coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0)) as net_fulfilled
      from sales s
      join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
      join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join dispatched on dispatched.sale_line_id=sl.id
      left join returned on returned.sale_line_id=sl.id
      left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      where s.workspace_id=${args.workspaceId}::uuid and s.status='posted' and sv.id is null
        and (${args.productId}::uuid is null or sl.product_id=${args.productId}::uuid)
        and (${args.unit}::unit is null or sl.unit=${args.unit}::unit)
        and sl.quantity_scaled > coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0)
    )
    select * from outstanding
    where (${after?.id ?? null}::uuid is null or sale_line_id < ${after?.id ?? null}::uuid)
    order by sale_line_id desc
    limit ${args.page.limit + 1}
  `)) as Record<string, unknown>[];
  const totals = (await tx.execute(sql`
    with dispatched as (
      select dl.sale_line_id, sum(dl.quantity_scaled) as quantity
      from delivery_lines dl
      join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      where d.workspace_id=${args.workspaceId}::uuid and d.status in ('dispatched','delivered')
      group by dl.sale_line_id
    ), returned as (
      select dl.sale_line_id, sum(drl.quantity_scaled) as quantity
      from delivery_return_lines drl
      join delivery_returns dr
        on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
      join delivery_lines dl
        on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
      where dr.workspace_id=${args.workspaceId}::uuid
      group by dl.sale_line_id
    )
    select sl.unit,
      coalesce(sum(sl.quantity_scaled-coalesce(dispatched.quantity,0)+coalesce(returned.quantity,0)),0) as quantity
    from sales s
    join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
    left join dispatched on dispatched.sale_line_id=sl.id
    left join returned on returned.sale_line_id=sl.id
    left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
    where s.workspace_id=${args.workspaceId}::uuid and s.status='posted' and sv.id is null
      and (${args.productId}::uuid is null or sl.product_id=${args.productId}::uuid)
      and (${args.unit}::unit is null or sl.unit=${args.unit}::unit)
      and sl.quantity_scaled > coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0)
    group by sl.unit
  `)) as Record<string, unknown>[];
  const items: OperationalReportDto["page"]["items"] = values
    .slice(0, args.page.limit)
    .map((row) => ({
      id: String(row["sale_line_id"]),
      label: `${String(row["display_name"])} · ${String(row["product_name"])}`,
      productId: null,
      productName: String(row["product_name"]),
      qualityGradeId: null,
      qualityGradeName: null,
      sourceType: "sale",
      sourceId: String(row["sale_id"]),
      documentHref: `/sales/${String(row["sale_id"])}`,
      transactionTime: null,
      amount: null,
      quantity: {
        valueScaled: persistedBigintToSafeNumber(
          BigInt(String(row["quantity_scaled"])) - BigInt(String(row["net_fulfilled"])),
          "outstanding delivery quantity",
        ),
        unit: row["unit"] as typeof inventoryMovements.$inferSelect.unit,
      },
      status: "outstanding",
    }));
  return {
    reportType: "outstanding_delivery",
    businessDate: args.businessDate,
    timezone: "Asia/Ho_Chi_Minh",
    integrity: "healthy",
    diagnostics: [],
    totals: {
      amount: null,
      quantities: totals.map((row) => ({
        unit: row["unit"] as typeof inventoryMovements.$inferSelect.unit,
        valueScaled: persistedBigintToSafeNumber(
          row["quantity"],
          "outstanding delivery total quantity",
        ),
      })),
    },
    page: {
      items,
      nextCursor:
        values.length <= args.page.limit || items.length === 0
          ? null
          : encodeCursor({ sortValue: "", id: items[items.length - 1]!.id }),
    },
  };
}

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
        return customerActivityAtScale(tx, {
          ...args,
          businessDayStartMinute: args.businessDayStartMinute ?? 0,
        });
      }
      if (args.reportType === "inventory_movement_report") {
        return inventoryMovementReportAtScale(tx, {
          ...args,
          businessDayStartMinute: args.businessDayStartMinute ?? 0,
        });
      }
      if (args.reportType === "customer_receivables") {
        return customerReceivablesAtScale(tx, args);
      }
      if (args.reportType === "supplier_payables") {
        return supplierPayablesAtScale(tx, args);
      }
      if (args.reportType === "outstanding_delivery") {
        return outstandingDeliveryAtScale(tx, args);
      }
      if (args.reportType === "cash_balances") {
        return cashBalancesAtScale(tx, args);
      }
      if (args.reportType === "cash_movement_report") {
        return cashMovementAtScale(tx, args);
      }
      if (args.reportType === "expense_report") {
        return expenseAtScale(tx, args);
      }
      if (args.reportType === "inventory_by_product_unit") {
        return inventoryBalancesAtScale(tx, args);
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
      if (args.reportType === "cash_balances") {
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
              select dl.sale_line_id, sum(dl.quantity_scaled) quantity
              from delivery_lines dl
              join deliveries d
                on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
              where d.workspace_id=${args.workspaceId}::uuid
                and d.status in ('dispatched','delivered')
              group by dl.sale_line_id
            ), returned as (
              select dl.sale_line_id, sum(drl.quantity_scaled) quantity
              from delivery_return_lines drl
              join delivery_returns dr
                on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
              join delivery_lines dl
                on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
              where dr.workspace_id=${args.workspaceId}::uuid
              group by dl.sale_line_id
            )
            select s.id as sale_id, c.display_name,
              sl.id as sale_line_id, sl.product_name, sl.quantity_scaled, sl.unit,
              (coalesce(dispatched.quantity,0)-coalesce(returned.quantity,0))
                as net_fulfilled
            from sales s
            join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
            join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
            left join dispatched on dispatched.sale_line_id=sl.id
            left join returned on returned.sale_line_id=sl.id
            left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
            where s.workspace_id=${args.workspaceId}::uuid and s.status='posted' and sv.id is null
          `);
        rows = values.flatMap((value) => {
          const ordered = persistedBigintToSafeNumber(
            value["quantity_scaled"],
            "outstanding delivery ordered quantity",
          );
          const net = persistedBigintToSafeNumber(
            value["net_fulfilled"],
            "outstanding delivery fulfilled quantity",
          );
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
      let quantityOverflow = false;
      for (const row of allRows) {
        if (row.quantity === null || quantityOverflow) continue;
        const next = (quantityTotals.get(row.quantity.unit) ?? 0) + row.quantity.valueScaled;
        if (!Number.isSafeInteger(next)) {
          quantityOverflow = true;
          continue;
        }
        quantityTotals.set(row.quantity.unit, next);
      }
      const amountTotal = amountRows.length === 0 ? null : sumMoneyExact(amountRows, "VND");
      if (amountRows.length > 0 && amountTotal === null)
        diagnostics.push("report_integrity_failure");
      if (quantityOverflow) diagnostics.push("report_integrity_failure");
      return {
        reportType: args.reportType,
        businessDate: args.businessDate,
        timezone: "Asia/Ho_Chi_Minh" as const,
        integrity: diagnostics.length === 0 ? ("healthy" as const) : ("attention" as const),
        diagnostics,
        totals: {
          amount:
            amountTotal === null ? null : money(amountTotal.amountMinor, amountTotal.currency),
          quantities: quantityOverflow
            ? []
            : [...quantityTotals.entries()].map(([unit, valueScaled]) => ({
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
