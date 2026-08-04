import { sql } from "drizzle-orm";
import {
  encodeCursor,
  type DashboardOrderStatusCountsDto,
  type DashboardSeriesDto,
  type DashboardSummaryDto,
  type DashboardTopProductsDto,
  type OperationsBoardDto,
  type OperationsBoardCountsDto,
  type OperationsBoardCountsInput,
  type OperationsBoardInput,
  type DashboardSeriesInput,
  type DashboardTopProductsInput,
  type Quantity,
  type DeliveryId,
  vietnamBusinessDateForInstant,
} from "@vuarau/domain-contracts";
import type { CursorPosition } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";

type Row = Record<string, unknown>;
const numberOf = (row: Row, name: string): number => Number(row[name] ?? 0);
const stringOf = (row: Row, name: string): string => String(row[name] ?? "");
const asMoney = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });
const asOf = () => new Date().toISOString();

function quantityTotals(rows: readonly Row[]): Quantity[] {
  const totals = new Map<string, number>();
  for (const row of rows)
    totals.set(
      stringOf(row, "unit"),
      (totals.get(stringOf(row, "unit")) ?? 0) + numberOf(row, "value"),
    );
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
        select count(*)::int as count,
          coalesce(sum(s.total_amount_minor - coalesce(sv.amount_minor, 0)), 0)::bigint as amount
        from sales s
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where s.workspace_id=${workspaceId}::uuid and s.status='posted'
      `),
      tx.execute(sql`
        select count(*)::int as count,
          coalesce(sum(p.total_amount_minor - coalesce(pv.amount_minor, 0)), 0)::bigint as amount
        from purchases p
        left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
        where p.workspace_id=${workspaceId}::uuid and p.status='confirmed'
      `),
      tx.execute(sql`
        select im.unit, coalesce(sum(im.quantity_scaled), 0)::bigint as value
        from inventory_movements im
        where im.workspace_id=${workspaceId}::uuid
          and im.source_type in ('purchase_receipt','purchase_receipt_reversal')
        group by im.unit
      `),
      tx.execute(sql`
        select ib.unit, coalesce(sum(ib.quantity_scaled), 0)::bigint as value
        from inventory_balances ib
        where ib.workspace_id=${workspaceId}::uuid
        group by ib.unit
      `),
      tx.execute(sql`
        with dispatched as (
          select dl.sale_line_id, sum(dl.quantity_scaled)::bigint as value
          from delivery_lines dl join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
          where d.workspace_id=${workspaceId}::uuid and d.status in ('dispatched','delivered')
          group by dl.sale_line_id
        ), returned as (
          select dl.sale_line_id, sum(drl.quantity_scaled)::bigint as value
          from delivery_return_lines drl join delivery_returns dr on dr.id=drl.return_id
          join delivery_lines dl on dl.id=drl.delivery_line_id
          where dr.workspace_id=${workspaceId}::uuid group by dl.sale_line_id
        )
        select sl.unit, coalesce(sum(greatest(sl.quantity_scaled-coalesce(dispatched.value,0)+coalesce(returned.value,0),0)),0)::bigint as value
        from sales s join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
        left join dispatched on dispatched.sale_line_id=sl.id
        left join returned on returned.sale_line_id=sl.id
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where s.workspace_id=${workspaceId}::uuid and s.status='posted' and sv.id is null
        group by sl.unit
      `),
      tx.execute(sql`
        select count(*)::int as count, coalesce(sum(greatest(balance_minor,0)),0)::bigint as amount
        from customer_account_balances where workspace_id=${workspaceId}::uuid
      `),
      tx.execute(sql`
        select count(*)::int as count, coalesce(sum(greatest(balance_minor,0)),0)::bigint as amount
        from supplier_account_balances where workspace_id=${workspaceId}::uuid
      `),
      tx.execute(sql`
        select count(*)::int as count, coalesce(sum(balance_minor),0)::bigint as amount
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

async function querySeries(tx: Tx, input: DashboardSeriesInput): Promise<DashboardSeriesDto> {
  const timestamp = asOf();
  const [sales, purchases, received, cash] = await Promise.all([
    tx.execute(sql`
      select (s.transaction_time at time zone 'Asia/Ho_Chi_Minh')::date::text as date,
        count(*)::int as orders,
        coalesce(sum(s.total_amount_minor-coalesce(sv.amount_minor,0)),0)::bigint as amount
      from sales s left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
        and s.transaction_time >= (${timestamp}::timestamptz - (${input.days - 1} || ' days')::interval)
      group by date
    `),
    tx.execute(sql`
      select (p.transaction_time at time zone 'Asia/Ho_Chi_Minh')::date::text as date,
        coalesce(sum(p.total_amount_minor-coalesce(pv.amount_minor,0)),0)::bigint as amount
      from purchases p left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
        and p.transaction_time >= (${timestamp}::timestamptz - (${input.days - 1} || ' days')::interval)
      group by date
    `),
    tx.execute(sql`
      select (im.transaction_time at time zone 'Asia/Ho_Chi_Minh')::date::text as date, im.unit,
        coalesce(sum(im.quantity_scaled),0)::bigint as value
      from inventory_movements im
      where im.workspace_id=${input.workspaceId}::uuid
        and im.source_type in ('purchase_receipt','purchase_receipt_reversal')
        and im.transaction_time >= (${timestamp}::timestamptz - (${input.days - 1} || ' days')::interval)
      group by date, im.unit
    `),
    tx.execute(sql`
      select (cm.transaction_time at time zone 'Asia/Ho_Chi_Minh')::date::text as date,
        coalesce(sum(cm.amount_minor),0)::bigint as amount
      from cash_movements cm
      where cm.workspace_id=${input.workspaceId}::uuid
        and cm.transaction_time >= (${timestamp}::timestamptz - (${input.days - 1} || ' days')::interval)
      group by date
    `),
  ]);
  const points = new Map<string, DashboardSeriesDto["points"][number]>();
  const today = vietnamBusinessDateForInstant(timestamp, 0);
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

async function queryRows(
  tx: Tx,
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
) {
  const rows = await tx.execute(sql`
    with delivered as (
      select dl.sale_line_id, max(d.id::text) as delivery_id,
        sum(dl.quantity_scaled)::bigint as dispatched
      from delivery_lines dl join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      group by dl.sale_line_id
    ), returned as (
      select dl.sale_line_id, sum(drl.quantity_scaled)::bigint as returned
      from delivery_return_lines drl join delivery_lines dl on dl.id=drl.delivery_line_id
      join delivery_returns dr on dr.id=drl.return_id
      where dr.workspace_id=${input.workspaceId}::uuid group by dl.sale_line_id
    ), sale_physical as (
      select s.id,
        case when coalesce(sum(greatest(sl.quantity_scaled-coalesce(delivered.dispatched,0)+coalesce(returned.returned,0),0)),0)=0 then 'delivered'
          when count(delivered.delivery_id)>0 then 'in_delivery' else 'needs_delivery' end as physical_state,
        max(delivered.delivery_id) as delivery_id
      from sales s join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join delivered on delivered.sale_line_id=sl.id left join returned on returned.sale_line_id=sl.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      group by s.id
    ), allocated as (
      select pa.sale_id, coalesce(sum(pa.amount_minor)-coalesce(sum(par.amount_minor),0),0)::bigint as amount
      from payment_allocations pa left join payment_allocation_reversals par on par.workspace_id=pa.workspace_id and par.allocation_id=pa.id
      where pa.workspace_id=${input.workspaceId}::uuid group by pa.sale_id
    ), purchase_received as (
      select pl.purchase_id, pl.id as line_id, pl.quantity_scaled,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else -prl.quantity_scaled end),0)::bigint as received
      from purchase_lines pl left join purchase_receipt_lines prl on prl.workspace_id=pl.workspace_id and prl.purchase_line_id=pl.id
      left join purchase_receipts pr on pr.workspace_id=prl.workspace_id and pr.id=prl.receipt_id
      left join purchase_receipt_reversals prr on prr.workspace_id=pr.workspace_id and prr.receipt_id=pr.id
      where pl.workspace_id=${input.workspaceId}::uuid group by pl.purchase_id, pl.id, pl.quantity_scaled
    ), purchase_physical as (
      select p.id, case when bool_and(pr.received >= pr.quantity_scaled) then 'received' else 'needs_receiving' end as physical_state
      from purchases p join purchase_received pr on pr.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid group by p.id
    )
    select s.id, 'sale' as kind, ('SALE-' || upper(substr(s.id::text,1,8))) as reference,
      c.display_name as counterparty, s.total_amount_minor as amount, s.currency,
      case when sv.id is null then 'posted' else 'voided' end as commercial_state,
      sale_physical.physical_state, case when sv.id is not null then 'voided' when coalesce(allocated.amount,0) >= s.total_amount_minor then 'paid' else 'awaiting_payment' end as financial_state,
      extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds, s.posted_at as updated_at,
      case when sale_physical.physical_state='needs_delivery' then 'Giao hàng' when coalesce(allocated.amount,0) < s.total_amount_minor then 'Thu tiền' else 'Theo dõi' end as next_action,
      sale_physical.delivery_id, ('/sales/' || s.id::text) as href
    from sales s join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
      join sale_physical on sale_physical.id=s.id left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id left join allocated on allocated.sale_id=s.id
    where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
    union all
    select p.id, 'purchase' as kind, ('PUR-' || upper(substr(p.id::text,1,8))) as reference,
      s.display_name as counterparty, p.total_amount_minor as amount, p.currency,
      case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
      purchase_physical.physical_state, case when pv.id is null then 'payable' else 'voided' end as financial_state,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds, p.confirmed_at as updated_at,
      case when purchase_physical.physical_state='needs_receiving' then 'Nhận hàng' else 'Theo dõi' end as next_action,
      null as delivery_id, ('/purchases/' || p.id::text) as href
    from purchases p join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id join purchase_physical on purchase_physical.id=p.id
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
  `);
  return (rows as Row[]).map((row) => ({
    id: stringOf(row, "id"),
    kind: stringOf(row, "kind") as "sale" | "purchase",
    reference: stringOf(row, "reference"),
    counterparty: stringOf(row, "counterparty"),
    amount: asMoney(numberOf(row, "amount")),
    commercialState: stringOf(row, "commercial_state"),
    physicalState: stringOf(row, "physical_state"),
    financialState: stringOf(row, "financial_state"),
    ageSeconds: numberOf(row, "age_seconds"),
    nextAction: stringOf(row, "next_action"),
    updatedAt: new Date(String(row["updated_at"])).toISOString(),
    href: stringOf(row, "href"),
    deliveryId: row["delivery_id"] === null ? null : (stringOf(row, "delivery_id") as DeliveryId),
  }));
}

function filterBoardRows(
  rows: readonly OperationsBoardDto["page"]["items"][number][],
  input: Pick<OperationsBoardInput, "filter" | "search">,
) {
  return rows
    .filter(
      (row) =>
        input.search.length === 0 ||
        `${row.reference} ${row.counterparty}`
          .toLocaleLowerCase()
          .includes(input.search.toLocaleLowerCase()),
    )
    .filter(
      (row) =>
        input.filter === "all" ||
        (input.filter === "needs_receiving" && row.physicalState === "needs_receiving") ||
        (input.filter === "needs_delivery" && row.physicalState === "needs_delivery") ||
        (input.filter === "in_delivery" && row.physicalState === "in_delivery") ||
        (input.filter === "awaiting_payment" && row.financialState === "awaiting_payment") ||
        (input.filter === "overdue" && row.financialState === "overdue") ||
        (input.filter === "attention" && row.commercialState === "attention"),
    );
}

function countsForRows(rows: readonly OperationsBoardDto["page"]["items"][number][]) {
  return {
    all: rows.length,
    needsReceiving: rows.filter((row) => row.physicalState === "needs_receiving").length,
    needsDelivery: rows.filter((row) => row.physicalState === "needs_delivery").length,
    inDelivery: rows.filter((row) => row.physicalState === "in_delivery").length,
    awaitingPayment: rows.filter((row) => row.financialState === "awaiting_payment").length,
    overdue: rows.filter((row) => row.financialState === "overdue").length,
    attention: rows.filter((row) => row.commercialState === "attention").length,
  };
}

export const createDashboardReadRepositories = (tx: Tx) => ({
  dashboardReads: {
    summary: (workspaceId: string) => querySummary(tx, workspaceId),
    salesSeries: (input: DashboardSeriesInput) => querySeries(tx, input),
    async orderStatusCounts(
      workspaceId: DashboardOrderStatusCountsDto["workspaceId"],
    ): Promise<DashboardOrderStatusCountsDto> {
      const rows = await queryRows(tx, {
        workspaceId,
        filter: "all",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 200,
        page: { after: null, limit: 200 },
        now: asOf(),
      });
      const count = (field: "commercialState" | "physicalState" | "financialState") =>
        [...new Set(rows.map((row) => row[field]))].map((key) => ({
          key,
          count: rows.filter((row) => row[field] === key).length,
        }));
      return {
        workspaceId,
        asOf: asOf(),
        commercial: count("commercialState"),
        physical: count("physicalState"),
        financial: count("financialState"),
      };
    },
    async operationsBoardCounts(
      input: OperationsBoardCountsInput & { readonly now: string },
    ): Promise<OperationsBoardCountsDto> {
      const rows = await queryRows(tx, {
        ...input,
        sort: "updated_desc",
        cursor: null,
        limit: Number.MAX_SAFE_INTEGER,
        page: { after: null, limit: Number.MAX_SAFE_INTEGER },
      });
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        counts: countsForRows(filterBoardRows(rows, input)),
      };
    },
    async topProducts(input: DashboardTopProductsInput) {
      const rows = await tx.execute(sql`
        select sl.product_id, sl.product_name, sl.unit,
          sum(sl.quantity_scaled)::bigint as quantity, sum(sl.line_total_minor)::bigint as amount
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
      const allRows = await queryRows(tx, input);
      const filtered = filterBoardRows(allRows, input).sort((left, right) =>
        input.sort === "amount_desc"
          ? right.amount.amountMinor - left.amount.amountMinor
          : input.sort === "age_desc"
            ? right.ageSeconds - left.ageSeconds
            : right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id),
      );
      const after = input.page.after;
      const visible = filtered
        .filter(
          (row) =>
            after === null ||
            (input.sort === "updated_desc"
              ? `${row.updatedAt}|${row.id}` < `${after.sortValue}|${after.id}`
              : row.id < after.id),
        )
        .slice(0, input.page.limit);
      const last = visible.at(-1);
      const sortValue =
        last === undefined
          ? null
          : input.sort === "amount_desc"
            ? String(last.amount.amountMinor)
            : input.sort === "age_desc"
              ? String(Math.round(last.ageSeconds))
              : last.updatedAt;
      const hasNext = last !== undefined && filtered.length > visible.length;
      return {
        workspaceId: input.workspaceId,
        asOf: input.now,
        counts: countsForRows(filtered),
        page: {
          items: visible,
          nextCursor:
            hasNext && sortValue !== null ? encodeCursor({ sortValue, id: last!.id }) : null,
        },
      };
    },
  },
});
