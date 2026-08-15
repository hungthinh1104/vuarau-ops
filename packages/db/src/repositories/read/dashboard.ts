import { sql } from "drizzle-orm";
import {
  encodeCursor,
  type DashboardOrderStatusCountsDto,
  type DashboardSeriesDto,
  type DashboardSummaryDto,
  type DashboardTopProductsDto,
  type OperationsBoardCountsDto,
  type OperationsBoardCountsInput,
  type OperationsBoardInput,
  type DashboardSeriesInput,
  type DashboardTopProductsInput,
  type Quantity,
  vietnamBusinessDateForInstant,
  vietnamBusinessDayRange,
} from "@vuarau/domain-contracts";
import type { CursorPosition } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import { exactIntegerSum } from "@vuarau/domain-kernel";
import { queryFastOperationsBoardPage } from "./dashboard-board.ts";
import { queryOperationsBoardCounts } from "./dashboard-board-counts.ts";
import { queryRows } from "./dashboard-rows.ts";
type Row = Record<string, unknown>;
const numberOf = (row: Row, name: string): number => {
  const raw = row[name] ?? 0;
  if (name === "age_seconds") {
    const value = Number(raw);
    if (!Number.isFinite(value)) throw new RangeError("Dashboard age is not finite.");
    return value;
  }
  return persistedBigintToSafeNumber(raw, `dashboard ${name}`);
};
const stringOf = (row: Row, name: string): string => String(row[name] ?? "");
const asMoney = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });
const asOf = () => new Date().toISOString();
function quantityTotals(rows: readonly Row[]): Quantity[] {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const unit = stringOf(row, "unit");
    const next = exactIntegerSum(
      [totals.get(unit) ?? 0, numberOf(row, "value")],
      `dashboard.${unit}.quantity_scaled`,
    );
    totals.set(unit, next);
  }
  return [...totals].map(([unit, valueScaled]) => ({
    unit: unit as Quantity["unit"],
    valueScaled,
  }));
}
function available(updatedAt: string) {
  return { state: "available" as const, diagnostics: [], updatedAt };
}

function amountWidget(asOfValue: string, row: Row, amountName = "amount", countName = "count") {
  return {
    availability: available(asOfValue),
    amount: asMoney(numberOf(row, amountName)),
    count: numberOf(row, countName),
  };
}

function quantityWidget(asOfValue: string, rows: readonly Row[], count: number) {
  return { availability: available(asOfValue), quantities: quantityTotals(rows), count };
}

async function querySummary(tx: Tx, workspaceId: string): Promise<DashboardSummaryDto> {
  const timestamp = asOf();
  const [sales, purchases, received, stock, outstanding, receivables, payables, cash] =
    await Promise.all([
      tx.execute(sql`
        select count(*) filter (where sv.id is null)::int as count,
          coalesce(sum(s.total_amount_minor - coalesce(sv.amount_minor, 0)), 0) as amount
        from sales s
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where s.workspace_id=${workspaceId}::uuid and s.status='posted'
      `),
      tx.execute(sql`
        select count(*) filter (where pv.id is null)::int as count,
          coalesce(sum(p.total_amount_minor - coalesce(pv.amount_minor, 0)), 0) as amount
        from purchases p
        left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
        where p.workspace_id=${workspaceId}::uuid and p.status='confirmed'
      `),
      tx.execute(sql`
        select im.unit, coalesce(sum(im.quantity_scaled), 0) as value
        from inventory_movements im
        where im.workspace_id=${workspaceId}::uuid
          and im.source_type in ('purchase_receipt','purchase_receipt_reversal','quality_disposition','quality_disposition_reversal')
        group by im.unit
      `),
      tx.execute(sql`
        select ib.unit, coalesce(sum(ib.quantity_scaled), 0) as value
        from inventory_balances ib
        where ib.workspace_id=${workspaceId}::uuid
        group by ib.unit
      `),
      tx.execute(sql`
        with dispatched as (
          select dl.sale_line_id, sum(dl.quantity_scaled) as value
          from delivery_lines dl join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
          where d.workspace_id=${workspaceId}::uuid and d.status in ('dispatched','delivered')
          group by dl.sale_line_id
        ), returned as (
          select dl.sale_line_id, sum(drl.quantity_scaled) as value
          from delivery_return_lines drl
          join delivery_returns dr
            on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
          join delivery_lines dl
            on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
          where dr.workspace_id=${workspaceId}::uuid group by dl.sale_line_id
        )
        select sl.unit, coalesce(sum(greatest(sl.quantity_scaled-coalesce(dispatched.value,0)+coalesce(returned.value,0),0)),0) as value
        from sales s join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
        left join dispatched on dispatched.sale_line_id=sl.id
        left join returned on returned.sale_line_id=sl.id
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where s.workspace_id=${workspaceId}::uuid and s.status='posted' and sv.id is null
        group by sl.unit
      `),
      tx.execute(sql`
        select count(*) filter (where balance_minor > 0)::int as count, coalesce(sum(greatest(balance_minor,0)),0) as amount
        from customer_account_balances where workspace_id=${workspaceId}::uuid
      `),
      tx.execute(sql`
        select count(*) filter (where balance_minor > 0)::int as count, coalesce(sum(greatest(balance_minor,0)),0) as amount
        from supplier_account_balances where workspace_id=${workspaceId}::uuid
      `),
      tx.execute(sql`
        select count(*)::int as count, coalesce(sum(balance_minor),0) as amount
        from cash_balances where workspace_id=${workspaceId}::uuid
      `),
    ]);
  return {
    workspaceId: workspaceId as DashboardSummaryDto["workspaceId"],
    asOf: timestamp,
    sales: amountWidget(timestamp, (sales[0] ?? {}) as Row),
    purchases: amountWidget(timestamp, (purchases[0] ?? {}) as Row),
    received: quantityWidget(timestamp, received as Row[], (received as Row[]).length),
    stock: quantityWidget(timestamp, stock as Row[], (stock as Row[]).length),
    outstandingDelivery: quantityWidget(
      timestamp,
      outstanding as Row[],
      (outstanding as Row[]).length,
    ),
    receivables: amountWidget(timestamp, (receivables[0] ?? {}) as Row),
    payables: amountWidget(timestamp, (payables[0] ?? {}) as Row),
    cash: amountWidget(timestamp, (cash[0] ?? {}) as Row),
  };
}

async function querySeries(
  tx: Tx,
  input: DashboardSeriesInput & {
    readonly businessDayStartMinute: number;
    readonly now: string;
  },
): Promise<DashboardSeriesDto> {
  const timestamp = input.now;
  const today = vietnamBusinessDateForInstant(timestamp, input.businessDayStartMinute);
  const startOfWindow = new Date(
    Date.parse(vietnamBusinessDayRange(today, input.businessDayStartMinute).start) -
      (input.days - 1) * 86_400_000,
  ).toISOString();
  const [sales, purchases, received, cash] = await Promise.all([
    tx.execute(sql`
      select (s.transaction_time at time zone 'Asia/Ho_Chi_Minh' - (${input.businessDayStartMinute} || ' minutes')::interval)::date::text as date,
        count(*) filter (where sv.id is null)::int as orders,
        coalesce(sum(s.total_amount_minor-coalesce(sv.amount_minor,0)),0) as amount
      from sales s left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
        and s.transaction_time >= ${startOfWindow}::timestamptz
      group by date
    `),
    tx.execute(sql`
      select (p.transaction_time at time zone 'Asia/Ho_Chi_Minh' - (${input.businessDayStartMinute} || ' minutes')::interval)::date::text as date,
        coalesce(sum(p.total_amount_minor-coalesce(pv.amount_minor,0)),0) as amount
      from purchases p left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
        and p.transaction_time >= ${startOfWindow}::timestamptz
      group by date
    `),
    tx.execute(sql`
      select (im.transaction_time at time zone 'Asia/Ho_Chi_Minh' - (${input.businessDayStartMinute} || ' minutes')::interval)::date::text as date, im.unit,
        coalesce(sum(im.quantity_scaled),0) as value
      from inventory_movements im
      where im.workspace_id=${input.workspaceId}::uuid
        and im.source_type in ('purchase_receipt','purchase_receipt_reversal','quality_disposition','quality_disposition_reversal')
        and im.transaction_time >= ${startOfWindow}::timestamptz
      group by date, im.unit
    `),
    tx.execute(sql`
      select (cm.transaction_time at time zone 'Asia/Ho_Chi_Minh' - (${input.businessDayStartMinute} || ' minutes')::interval)::date::text as date,
        coalesce(sum(cm.amount_minor),0) as amount
      from cash_movements cm
      where cm.workspace_id=${input.workspaceId}::uuid
        and cm.transaction_time >= ${startOfWindow}::timestamptz
      group by date
    `),
  ]);
  const points = new Map<string, DashboardSeriesDto["points"][number]>();
  const endDate = new Date(`${today}T00:00:00.000Z`);
  for (let index = 0; index < input.days; index += 1) {
    const date = new Date(endDate.getTime() - (input.days - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10) as DashboardSeriesDto["points"][number]["date"];
    points.set(date, {
      date,
      sales: asMoney(0),
      orderCount: 0,
      purchases: asMoney(0),
      received: [],
      cash: asMoney(0),
    });
  }
  for (const row of sales as Row[]) {
    const point = points.get(stringOf(row, "date") as DashboardSeriesDto["points"][number]["date"]);
    if (point)
      points.set(point.date, {
        ...point,
        sales: asMoney(numberOf(row, "amount")),
        orderCount: numberOf(row, "orders"),
      });
  }
  for (const row of purchases as Row[]) {
    const point = points.get(stringOf(row, "date") as DashboardSeriesDto["points"][number]["date"]);
    if (point) points.set(point.date, { ...point, purchases: asMoney(numberOf(row, "amount")) });
  }
  for (const row of received as Row[]) {
    const point = points.get(stringOf(row, "date") as DashboardSeriesDto["points"][number]["date"]);
    if (point)
      points.set(point.date, {
        ...point,
        received: [
          ...point.received,
          { unit: stringOf(row, "unit") as Quantity["unit"], valueScaled: numberOf(row, "value") },
        ],
      });
  }
  for (const row of cash as Row[]) {
    const point = points.get(stringOf(row, "date") as DashboardSeriesDto["points"][number]["date"]);
    if (point) points.set(point.date, { ...point, cash: asMoney(numberOf(row, "amount")) });
  }
  return { workspaceId: input.workspaceId, asOf: timestamp, points: [...points.values()] };
}

export const createDashboardReadRepositories = (tx: Tx) => ({
  dashboardReads: {
    summary: (workspaceId: string) => querySummary(tx, workspaceId),
    salesSeries: (
      input: DashboardSeriesInput & {
        readonly businessDayStartMinute: number;
        readonly now: string;
      },
    ) => querySeries(tx, input),
    async orderStatusCounts(
      workspaceId: DashboardOrderStatusCountsDto["workspaceId"],
    ): Promise<DashboardOrderStatusCountsDto> {
      const result = await queryOperationsBoardCounts(tx, {
        workspaceId,
        filter: "all",
        search: "",
        now: asOf(),
      });
      return {
        workspaceId,
        asOf: asOf(),
        ...result.statusCounts,
      };
    },
    async operationsBoardCounts(
      input: OperationsBoardCountsInput & { readonly now: string },
    ): Promise<OperationsBoardCountsDto> {
      if (input.search.length === 0) {
        const result = await queryOperationsBoardCounts(tx, input);
        return {
          workspaceId: input.workspaceId,
          asOf: input.now,
          counts: result.counts,
        };
      }
      const result = await queryRows(
        tx,
        {
          ...input,
          // Counts describe the complete search scope, not the selected chip.
          // Keep accepting the legacy filter field at the API boundary, but do
          // not let it narrow the population used for the count strip.
          filter: "all",
          sort: "updated_desc",
          cursor: null,
          limit: 1,
          page: { after: null, limit: 1 },
        },
        { includeActivity: false, includeCounts: true },
      );
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        counts: result.counts,
      };
    },
    async topProducts(input: DashboardTopProductsInput) {
      const rows = await tx.execute(sql`
        select sl.product_id, sl.product_name, sl.unit,
          sum(sl.quantity_scaled) as quantity, sum(sl.line_total_minor) as amount
        from sale_lines sl join sales s on s.workspace_id=sl.workspace_id and s.id=sl.sale_id
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where sl.workspace_id=${input.workspaceId}::uuid and s.status='posted' and sv.id is null
        group by sl.product_id, sl.product_name, sl.unit order by amount desc limit ${input.limit}
      `);
      return {
        workspaceId: input.workspaceId,
        asOf: asOf(),
        products: (rows as Row[]).map((row) => ({
          productId: row["product_id"] as DashboardTopProductsDto["products"][number]["productId"],
          productName: stringOf(row, "product_name"),
          quantity: {
            unit: stringOf(row, "unit") as Quantity["unit"],
            valueScaled: numberOf(row, "quantity"),
          },
          sales: asMoney(numberOf(row, "amount")),
        })),
      };
    },
    async operationsBoard(
      input: OperationsBoardInput & {
        page: { after: CursorPosition | null; limit: number };
        now: string;
      },
    ) {
      const result =
        input.filter === "all" && input.search.length === 0 && input.sort === "updated_desc"
          ? await queryFastOperationsBoardPage(tx, input)
          : await queryRows(tx, input, { includeActivity: true, includeCounts: false });
      const visible = result.rows.slice(0, input.page.limit);
      const last = visible.at(-1);
      const sortValue =
        last === undefined
          ? null
          : input.sort === "amount_desc"
            ? String(last.amount.amountMinor)
            : input.sort === "age_desc"
              ? String(last.ageSeconds)
              : last.updatedAt;
      const hasNext = result.rows.length > visible.length;
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        page: {
          items: visible,
          nextCursor:
            hasNext && sortValue !== null ? encodeCursor({ sortValue, id: last!.id }) : null,
        },
      };
    },
  },
});
