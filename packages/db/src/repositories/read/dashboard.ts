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
  type DeliveryId,
  vietnamBusinessDateForInstant,
  vietnamBusinessDayRange,
} from "@vuarau/domain-contracts";
import type { CursorPosition } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import { exactIntegerSum } from "@vuarau/domain-kernel";

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
        select count(*) filter (where s.total_amount_minor - coalesce(sv.amount_minor, 0) > 0)::int as count,
          coalesce(sum(s.total_amount_minor - coalesce(sv.amount_minor, 0)), 0) as amount
        from sales s
        left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
        where s.workspace_id=${workspaceId}::uuid and s.status='posted'
      `),
      tx.execute(sql`
        select count(*) filter (where p.total_amount_minor - coalesce(pv.amount_minor, 0) > 0)::int as count,
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
        count(*)::int as orders,
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

async function queryRows(
  tx: Tx,
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
) {
  const filterClause =
    input.filter === "needs_receiving"
      ? sql`physical_state = 'needs_receiving'`
      : input.filter === "needs_delivery"
        ? sql`physical_state = 'needs_delivery'`
        : input.filter === "in_delivery"
          ? sql`physical_state = 'in_delivery'`
          : input.filter === "awaiting_payment"
            ? sql`financial_state = 'awaiting_payment'`
            : input.filter === "overdue"
              ? sql`financial_state = 'overdue'`
              : input.filter === "attention"
                ? sql`(commercial_state = 'attention' or physical_state = 'attention')`
                : sql`true`;
  const searchClause =
    input.search.length === 0
      ? sql`true`
      : sql`lower(reference || ' ' || counterparty) like ${`%${input.search.toLocaleLowerCase()}%`}`;
  const cursorClause = (() => {
    const after = input.page.after;
    if (after === null) return sql`true`;
    if (input.sort === "amount_desc") {
      const amount = Number(after.sortValue);
      return sql`(amount < ${amount} or (amount = ${amount} and id < ${after.id}))`;
    }
    if (input.sort === "age_desc") {
      const age = Number(after.sortValue);
      return sql`(age_seconds < ${age} or (age_seconds = ${age} and id < ${after.id}))`;
    }
    return sql`(updated_at < ${after.sortValue}::timestamptz or (updated_at = ${after.sortValue}::timestamptz and id < ${after.id}))`;
  })();
  const orderClause =
    input.sort === "amount_desc"
      ? sql`amount desc, id desc`
      : input.sort === "age_desc"
        ? sql`age_seconds desc, id desc`
        : sql`updated_at desc, id desc`;
  const limitClause =
    input.page.limit === Number.MAX_SAFE_INTEGER ? sql`all` : sql`${input.page.limit + 1}`;
  const rows = await tx.execute(sql`
    with recursive delivered as (
      select dl.sale_line_id,
        sum(dl.quantity_scaled) as dispatched
      from delivery_lines dl join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      group by dl.sale_line_id
    ), latest_delivery as (
      select distinct on (d.sale_id) d.sale_id, d.id as delivery_id
      from deliveries d
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      order by d.sale_id, d.transaction_time desc, d.recorded_at desc, d.id desc
    ), returned as (
      select dl.sale_line_id, sum(drl.quantity_scaled) as returned
      from delivery_return_lines drl
      join delivery_lines dl
        on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
      join delivery_returns dr
        on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
      where dr.workspace_id=${input.workspaceId}::uuid group by dl.sale_line_id
    ), dispatched_remaining as (
      select dl.sale_line_id,
        sum(greatest(dl.quantity_scaled-coalesce(ret.returned,0),0)) as remaining
      from delivery_lines dl
      join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      left join (
        select drl.delivery_line_id, sum(drl.quantity_scaled) as returned
        from delivery_return_lines drl
        join delivery_returns dr on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
        where dr.workspace_id=${input.workspaceId}::uuid
        group by drl.delivery_line_id
      ) ret on ret.delivery_line_id=dl.id
      where dl.workspace_id=${input.workspaceId}::uuid and d.status='dispatched'
      group by dl.sale_line_id
    ), sale_physical as (
      select s.id,
        case
          when bool_or(coalesce(delivered.dispatched,0)-coalesce(returned.returned,0) > sl.quantity_scaled) then 'attention'
          when coalesce(sum(greatest(sl.quantity_scaled-coalesce(delivered.dispatched,0)+coalesce(returned.returned,0),0)),0)=0 then 'delivered'
          when coalesce(sum(dispatched_remaining.remaining),0)>0 then 'in_delivery'
          else 'needs_delivery'
        end as physical_state,
        max(latest_delivery.delivery_id::text)::uuid as delivery_id
      from sales s join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join delivered on delivered.sale_line_id=sl.id
      left join returned on returned.sale_line_id=sl.id
      left join dispatched_remaining on dispatched_remaining.sale_line_id=sl.id
      left join latest_delivery on latest_delivery.sale_id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      group by s.id
    ), allocation_reversals as (
      select par.workspace_id, par.allocation_id, coalesce(sum(par.amount_minor),0) as amount
      from payment_allocation_reversals par
      where par.workspace_id=${input.workspaceId}::uuid
      group by par.workspace_id, par.allocation_id
    ), allocated as (
      select pa.sale_id,
      coalesce(sum(pa.amount_minor - coalesce(ar.amount,0)),0) as amount
      from payment_allocations pa
      left join allocation_reversals ar
        on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
      where pa.workspace_id=${input.workspaceId}::uuid group by pa.sale_id
    ), unallocated_by_customer as (
      select p.customer_id,
        coalesce(sum(greatest(
          p.amount_minor-p.reversed_amount_minor-coalesce(allocated_payment.amount,0),
          0
        )),0) as amount
      from payments p
      left join (
        select pa.payment_id,
          coalesce(sum(pa.amount_minor-coalesce(ar.amount,0)),0) as amount
        from payment_allocations pa
        left join allocation_reversals ar
          on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
        where pa.workspace_id=${input.workspaceId}::uuid
        group by pa.payment_id
      ) allocated_payment on allocated_payment.payment_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
      group by p.customer_id
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else -prl.quantity_scaled end),0) as received
      from purchase_receipt_lines prl
      join purchase_receipts pr on pr.workspace_id=prl.workspace_id and pr.id=prl.receipt_id
      left join purchase_receipt_reversals prr on prr.workspace_id=pr.workspace_id and prr.receipt_id=pr.id
      where prl.workspace_id=${input.workspaceId}::uuid
      group by prl.workspace_id, prl.purchase_line_id
    ), disposition_roots as (
      select qd.workspace_id, qd.id as disposition_id, gal.purchase_line_id
      from quality_dispositions qd
      join goods_arrival_lines gal
        on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
      where qd.workspace_id=${input.workspaceId}::uuid and qd.source_type='arrival_line'
      union all
      select child.workspace_id, child.id, parent.purchase_line_id
      from quality_dispositions child
      join quality_disposition_allocations source_allocation
        on source_allocation.workspace_id=child.workspace_id
        and source_allocation.id=child.source_quarantine_allocation_id
        and source_allocation.outcome='quarantined'
      join disposition_roots parent
        on parent.workspace_id=source_allocation.workspace_id
        and parent.disposition_id=source_allocation.disposition_id
      where child.workspace_id=${input.workspaceId}::uuid and child.source_type='quarantine_allocation'
    ), inspected_accepted as (
      select qda.workspace_id, roots.purchase_line_id,
        coalesce(sum(qda.value_scaled),0) as accepted
      from quality_disposition_allocations qda
      join quality_dispositions qd
        on qd.workspace_id=qda.workspace_id and qd.id=qda.disposition_id
      join disposition_roots roots
        on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
      left join quality_disposition_reversals qdr
        on qdr.workspace_id=qd.workspace_id and qdr.disposition_id=qd.id
      where qda.workspace_id=${input.workspaceId}::uuid
        and qda.outcome='accepted' and qdr.id is null
      group by qda.workspace_id, roots.purchase_line_id
    ), purchase_received as (
      select pl.purchase_id, pl.id as line_id, pl.quantity_scaled,
        (coalesce(direct.received,0) + coalesce(inspected.accepted,0)) as received
      from purchase_lines pl
      left join direct_received direct
        on direct.workspace_id=pl.workspace_id and direct.purchase_line_id=pl.id
      left join inspected_accepted inspected
        on inspected.workspace_id=pl.workspace_id and inspected.purchase_line_id=pl.id
      where pl.workspace_id=${input.workspaceId}::uuid
    ), purchase_physical as (
      select p.id, case when bool_and(pr.received >= pr.quantity_scaled) then 'received' else 'needs_receiving' end as physical_state
      from purchases p join purchase_received pr on pr.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid group by p.id
    ), board_rows as (
    select s.id, 'sale' as kind, ('SALE-' || upper(substr(s.id::text,1,8))) as reference,
      c.display_name as counterparty, s.total_amount_minor as amount, s.currency,
      case when sv.id is not null then 'voided' when sale_physical.physical_state='attention' then 'attention' else 'posted' end as commercial_state,
      sale_physical.physical_state,
      case
        when sv.id is not null then 'voided'
        when coalesce(allocated.amount,0) >= s.total_amount_minor then 'paid'
        when coalesce(unallocated_by_customer.amount,0) > 0 then 'reconciliation_required'
        when s.due_at is not null and s.due_at < ${input.now}::timestamptz then 'overdue'
        else 'awaiting_payment'
      end as financial_state,
      extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds, s.posted_at as updated_at,
      case when sv.id is not null then null when sale_physical.physical_state='attention' then 'Kiểm tra' when sale_physical.physical_state='needs_delivery' then 'Giao hàng' when coalesce(unallocated_by_customer.amount,0) > 0 then 'Đối soát thanh toán' when coalesce(allocated.amount,0) < s.total_amount_minor then 'Thu tiền' else null end as next_action,
      sale_physical.delivery_id, ('/sales/' || s.id::text) as href
    from sales s join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
      join sale_physical on sale_physical.id=s.id left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id left join allocated on allocated.sale_id=s.id left join unallocated_by_customer on unallocated_by_customer.customer_id=s.customer_id
    where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
    union all
    select p.id, 'purchase' as kind, ('PUR-' || upper(substr(p.id::text,1,8))) as reference,
      s.display_name as counterparty, p.total_amount_minor as amount, p.currency,
      case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
      purchase_physical.physical_state, case when pv.id is null then 'payable' else 'voided' end as financial_state,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds, p.confirmed_at as updated_at,
      case when pv.id is not null then null when purchase_physical.physical_state='needs_receiving' then 'Nhận hàng' else null end as next_action,
      null as delivery_id, ('/purchases/' || p.id::text) as href
    from purchases p join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id join purchase_physical on purchase_physical.id=p.id
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    ), filtered_rows as (
    select board_rows.*,
      count(*) over() as all_count,
      count(*) filter (where physical_state='needs_receiving') over() as needs_receiving_count,
      count(*) filter (where physical_state='needs_delivery') over() as needs_delivery_count,
      count(*) filter (where physical_state='in_delivery') over() as in_delivery_count,
      count(*) filter (where financial_state='awaiting_payment') over() as awaiting_payment_count,
      count(*) filter (where financial_state='overdue') over() as overdue_count,
      count(*) filter (where commercial_state='attention' or physical_state='attention') over() as attention_count,
      count(*) filter (where commercial_state='posted') over() as commercial_posted_count,
      count(*) filter (where commercial_state='confirmed') over() as commercial_confirmed_count,
      count(*) filter (where commercial_state='voided') over() as commercial_voided_count,
      count(*) filter (where commercial_state='attention') over() as commercial_attention_count,
      count(*) filter (where physical_state='needs_receiving') over() as physical_needs_receiving_count,
      count(*) filter (where physical_state='needs_delivery') over() as physical_needs_delivery_count,
      count(*) filter (where physical_state='in_delivery') over() as physical_in_delivery_count,
      count(*) filter (where physical_state='delivered') over() as physical_delivered_count,
      count(*) filter (where physical_state='received') over() as physical_received_count,
      count(*) filter (where physical_state='attention') over() as physical_attention_count,
      count(*) filter (where financial_state='paid') over() as financial_paid_count,
      count(*) filter (where financial_state='payable') over() as financial_payable_count,
      count(*) filter (where financial_state='reconciliation_required') over() as financial_reconciliation_required_count,
      count(*) filter (where financial_state='awaiting_payment') over() as financial_awaiting_payment_count,
      count(*) filter (where financial_state='overdue') over() as financial_overdue_count,
      count(*) filter (where financial_state='voided') over() as financial_voided_count
    from board_rows
    where ${searchClause} and ${filterClause}
    )
    select *
    from filtered_rows
    where ${cursorClause}
    order by ${orderClause}
    limit ${limitClause}
  `);
  const rawRows = rows as Row[];
  const first = rawRows[0];
  const counts = {
    all: first === undefined ? 0 : numberOf(first, "all_count"),
    needsReceiving: first === undefined ? 0 : numberOf(first, "needs_receiving_count"),
    needsDelivery: first === undefined ? 0 : numberOf(first, "needs_delivery_count"),
    inDelivery: first === undefined ? 0 : numberOf(first, "in_delivery_count"),
    awaitingPayment: first === undefined ? 0 : numberOf(first, "awaiting_payment_count"),
    overdue: first === undefined ? 0 : numberOf(first, "overdue_count"),
    attention: first === undefined ? 0 : numberOf(first, "attention_count"),
  };
  return {
    counts,
    statusCounts: {
      commercial: statusCounts(first, [
        ["posted", "commercial_posted_count"],
        ["confirmed", "commercial_confirmed_count"],
        ["voided", "commercial_voided_count"],
        ["attention", "commercial_attention_count"],
      ]),
      physical: statusCounts(first, [
        ["needs_receiving", "physical_needs_receiving_count"],
        ["needs_delivery", "physical_needs_delivery_count"],
        ["in_delivery", "physical_in_delivery_count"],
        ["delivered", "physical_delivered_count"],
        ["received", "physical_received_count"],
        ["attention", "physical_attention_count"],
      ]),
      financial: statusCounts(first, [
        ["paid", "financial_paid_count"],
        ["payable", "financial_payable_count"],
        ["reconciliation_required", "financial_reconciliation_required_count"],
        ["awaiting_payment", "financial_awaiting_payment_count"],
        ["overdue", "financial_overdue_count"],
        ["voided", "financial_voided_count"],
      ]),
    },
    rows: rawRows.map((row) => ({
      id: stringOf(row, "id"),
      kind: stringOf(row, "kind") as "sale" | "purchase",
      reference: stringOf(row, "reference"),
      counterparty: stringOf(row, "counterparty"),
      amount: asMoney(numberOf(row, "amount")),
      commercialState: stringOf(row, "commercial_state"),
      physicalState: stringOf(row, "physical_state"),
      financialState: stringOf(row, "financial_state"),
      ageSeconds: numberOf(row, "age_seconds"),
      nextAction: row["next_action"] === null ? null : stringOf(row, "next_action"),
      updatedAt: new Date(String(row["updated_at"])).toISOString(),
      href: stringOf(row, "href"),
      deliveryId: row["delivery_id"] === null ? null : (stringOf(row, "delivery_id") as DeliveryId),
    })),
  };
}

function statusCounts(
  row: Row | undefined,
  entries: readonly (readonly [string, string])[],
): { key: string; count: number }[] {
  if (row === undefined) return [];
  return entries
    .map(([key, column]) => ({ key, count: numberOf(row, column) }))
    .filter((entry) => entry.count > 0);
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
      const result = await queryRows(tx, {
        workspaceId,
        filter: "all",
        sort: "updated_desc",
        search: "",
        cursor: null,
        limit: 1,
        page: { after: null, limit: 1 },
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
      const result = await queryRows(tx, {
        ...input,
        sort: "updated_desc",
        cursor: null,
        limit: 1,
        page: { after: null, limit: 1 },
      });
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
      const result = await queryRows(tx, input);
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
        counts: result.counts,
        page: {
          items: visible,
          nextCursor:
            hasNext && sortValue !== null ? encodeCursor({ sortValue, id: last!.id }) : null,
        },
      };
    },
  },
});
