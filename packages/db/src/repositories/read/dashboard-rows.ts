import { sql } from "drizzle-orm";
import type { CursorPosition, OperationsBoardInput } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import { mapOperationsBoardRows } from "./dashboard-row-mapper.ts";
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
function statusCounts(row: Row | undefined, entries: readonly (readonly [string, string])[]) {
  if (row === undefined) return [];
  return entries
    .map(([key, column]) => ({ key, count: numberOf(row, column) }))
    .filter((entry) => entry.count > 0);
}
export async function queryRows(
  tx: Tx,
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
  options: { readonly includeActivity: boolean; readonly includeCounts: boolean },
) {
  const filterClause =
    input.filter === "outstanding_delivery"
      ? sql`physical_state in ('needs_delivery', 'in_delivery') and not returned_fulfilment and not fulfilment_remainder_unresolved and fulfilment_remainder_outcome is distinct from 'cancel_remainder'`
      : input.filter === "incomplete_receiving" || input.filter === "needs_receiving"
        ? sql`physical_state = 'needs_receiving'`
        : input.filter === "needs_delivery"
          ? sql`physical_state = 'needs_delivery'`
          : input.filter === "in_delivery"
            ? sql`physical_state = 'in_delivery'`
            : input.filter === "returned_fulfilment"
              ? sql`returned_fulfilment`
              : input.filter === "unallocated_payment"
                ? sql`unallocated_payment`
                : input.filter === "awaiting_payment"
                  ? sql`financial_state = 'awaiting_payment'`
                  : input.filter === "overdue" || input.filter === "overdue_receivable"
                    ? sql`financial_state = 'overdue'`
                    : input.filter === "attention"
                      ? sql`(commercial_state = 'attention' or physical_state = 'attention' or financial_state = 'unallocated')`
                      : input.filter === "fulfilment_remainder_unresolved"
                        ? sql`fulfilment_remainder_unresolved`
                        : input.filter === "return_settlement_unresolved"
                          ? sql`returned_fulfilment and not return_settlement_resolved`
                          : input.filter === "reconciliation_variance"
                            ? sql`reconciliation_variance`
                            : sql`true`;
  const searchPattern = `%${input.search.toLocaleLowerCase()}%`,
    searchClause =
      input.search.length === 0
        ? sql`true`
        : sql`lower(reference || ' ' || counterparty) like ${searchPattern}`;
  const searchCtes =
    input.search.length === 0
      ? sql``
      : sql`
    search_candidates as (
      select s.id, 'sale' as kind
      from sales s
      join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
      where s.workspace_id=${input.workspaceId}::uuid
        and lower(('SALE-' || upper(substr(s.id::text,1,8))) || ' ' || c.display_name) like ${searchPattern}
      union all
      select p.id, 'purchase' as kind
      from purchases p
      join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id
      where p.workspace_id=${input.workspaceId}::uuid
        and lower(('PUR-' || upper(substr(p.id::text,1,8))) || ' ' || s.display_name) like ${searchPattern}
      union all
      select p.id, 'payment' as kind
      from payments p
      join customers c on c.workspace_id=p.workspace_id and c.id=p.customer_id
      where p.workspace_id=${input.workspaceId}::uuid
        and p.status <> 'reversed'
        and lower(('PAY-' || upper(substr(p.id::text,1,8))) || ' ' || c.display_name) like ${searchPattern}
    ),`;
  const saleSearchJoin =
    input.search.length === 0
      ? sql``
      : sql`
      join search_candidates search_sale
        on search_sale.kind='sale' and search_sale.id=s.id`;
  const purchaseSearchJoin =
    input.search.length === 0
      ? sql``
      : sql`
      join search_candidates search_purchase
        on search_purchase.kind='purchase' and search_purchase.id=p.id`;
  const paymentSearchJoin =
    input.search.length === 0
      ? sql` `
      : sql`
      join search_candidates search_payment
        on search_payment.kind='payment' and search_payment.id=p.id`;
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
  const useFastPage =
    !options.includeCounts &&
    input.filter === "all" &&
    input.search.length === 0 &&
    input.sort === "updated_desc";
  const activityCtes = options.includeActivity
    ? sql`
    sale_activity_events as (
      select sv.workspace_id, sv.sale_id as id, sv.recorded_at
      from sale_voids sv
      where sv.workspace_id=${input.workspaceId}::uuid
      union all
      select d.workspace_id, d.sale_id as id, d.recorded_at
      from deliveries d
      where d.workspace_id=${input.workspaceId}::uuid
      union all
      select d.workspace_id, d.sale_id as id, dr.recorded_at
      from delivery_returns dr
      join deliveries d
        on d.workspace_id=dr.workspace_id and d.id=dr.delivery_id
      where dr.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.sale_id as id, pa.recorded_at
      from payment_allocations pa
      where pa.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.sale_id as id, par.recorded_at
      from payment_allocation_reversals par
      join payment_allocations pa
        on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
      where par.workspace_id=${input.workspaceId}::uuid
    ), sale_activity as (
      select s.workspace_id, s.id,
        greatest(s.recorded_at, coalesce(s.posted_at, s.recorded_at), coalesce(events.recorded_at, s.recorded_at)) as updated_at
      from sales s ${saleSearchJoin}
      left join (
        select workspace_id, id, max(recorded_at) as recorded_at
        from sale_activity_events
        group by workspace_id, id
      ) events on events.workspace_id=s.workspace_id and events.id=s.id
      where s.workspace_id=${input.workspaceId}::uuid
    ), purchase_disposition_roots as (
      select qd.workspace_id, qd.id as disposition_id, gal.purchase_id
      from quality_dispositions qd
      join goods_arrival_lines gal
        on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
      where qd.workspace_id=${input.workspaceId}::uuid
        and qd.source_type='arrival_line'
        and gal.purchase_id is not null
      union all
      select child.workspace_id, child.id, parent.purchase_id
      from quality_dispositions child
      join quality_disposition_allocations source_allocation
        on source_allocation.workspace_id=child.workspace_id
        and source_allocation.id=child.source_quarantine_allocation_id
        and source_allocation.outcome='quarantined'
      join purchase_disposition_roots parent
        on parent.workspace_id=source_allocation.workspace_id
        and parent.disposition_id=source_allocation.disposition_id
      where child.workspace_id=${input.workspaceId}::uuid
        and child.source_type='quarantine_allocation'
    ), purchase_activity_events as (
      select pv.workspace_id, pv.purchase_id as id, pv.recorded_at
      from purchase_voids pv
      where pv.workspace_id=${input.workspaceId}::uuid
      union all
      select pr.workspace_id, pr.purchase_id as id, pr.recorded_at
      from purchase_receipts pr
      where pr.workspace_id=${input.workspaceId}::uuid
      union all
      select pr.workspace_id, pr.purchase_id as id, prr.recorded_at
      from purchase_receipt_reversals prr
      join purchase_receipts pr
        on pr.workspace_id=prr.workspace_id and pr.id=prr.receipt_id
      where prr.workspace_id=${input.workspaceId}::uuid
      union all
      select ga.workspace_id, ga.purchase_id as id, ga.recorded_at
      from goods_arrivals ga
      where ga.workspace_id=${input.workspaceId}::uuid and ga.purchase_id is not null
      union all
      select roots.workspace_id, roots.purchase_id as id, qd.recorded_at
      from quality_dispositions qd
      join purchase_disposition_roots roots
        on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
      where qd.workspace_id=${input.workspaceId}::uuid
      union all
      select roots.workspace_id, roots.purchase_id as id, qdr.recorded_at
      from quality_disposition_reversals qdr
      join quality_dispositions qd
        on qd.workspace_id=qdr.workspace_id and qd.id=qdr.disposition_id
      join purchase_disposition_roots roots
        on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
      where qdr.workspace_id=${input.workspaceId}::uuid
    ), purchase_activity as (
      select p.workspace_id, p.id,
        greatest(p.recorded_at, coalesce(p.confirmed_at, p.recorded_at), coalesce(events.recorded_at, p.recorded_at)) as updated_at
      from purchases p ${purchaseSearchJoin}
      left join (
        select workspace_id, id, max(recorded_at) as recorded_at
        from purchase_activity_events
        group by workspace_id, id
      ) events on events.workspace_id=p.workspace_id and events.id=p.id
      where p.workspace_id=${input.workspaceId}::uuid
    ),`
    : sql``;
  // The canonical facts views preserve every source line. A fast Board page
  // only needs the candidate lines, so project the same facts after applying
  // candidate_scope. This keeps the page truthful without aggregating the
  // whole workspace before the keyset page is known.
  const scopedFactCtes = useFastPage
    ? sql`
    sale_scoped_facts as (
      with returned as (
        select drl.workspace_id, drl.delivery_line_id,
          coalesce(sum(drl.quantity_scaled), 0) as returned_quantity_scaled,
          coalesce(bool_or(drl.unit <> dl.unit or dr.delivery_id <> dl.delivery_id), false)
            as invalid_return_unit
        from delivery_return_lines drl
        join delivery_returns dr on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
        join delivery_lines dl on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
        join sale_lines scoped_sl on scoped_sl.workspace_id=dl.workspace_id and scoped_sl.id=dl.sale_line_id
        join candidate_scope scoped_candidate
          on scoped_candidate.kind='sale' and scoped_candidate.id=scoped_sl.sale_id
        group by drl.workspace_id, drl.delivery_line_id
      ), active_lines as (
        select dl.workspace_id, sl.sale_id, dl.sale_line_id,
          dl.quantity_scaled as dispatched_quantity_scaled,
          coalesce(returned.returned_quantity_scaled, 0) as returned_quantity_scaled,
          d.status as delivery_status,
          (dl.unit <> sl.unit or dl.product_id is distinct from sl.product_id
            or coalesce(returned.invalid_return_unit, false)) as invalid_unit
        from delivery_lines dl
        join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
        join sale_lines sl on sl.workspace_id=dl.workspace_id and sl.id=dl.sale_line_id
        join candidate_scope scoped_candidate
          on scoped_candidate.kind='sale' and scoped_candidate.id=sl.sale_id
        left join returned on returned.workspace_id=dl.workspace_id and returned.delivery_line_id=dl.id
        where d.status in ('dispatched','delivered')
      ), delivery_facts as (
        select workspace_id, sale_id, sale_line_id,
          sum(dispatched_quantity_scaled) as dispatched_quantity_scaled,
          sum(returned_quantity_scaled) as returned_quantity_scaled,
          sum(dispatched_quantity_scaled-returned_quantity_scaled) as net_fulfilled_quantity_scaled,
          sum(case when delivery_status='dispatched'
            then greatest(dispatched_quantity_scaled-returned_quantity_scaled, 0) else 0 end)
            as active_dispatched_remaining_quantity_scaled,
          bool_or(invalid_unit) as invalid_unit
        from active_lines
        group by workspace_id, sale_id, sale_line_id
      )
      select sl.workspace_id, sl.sale_id, sl.id as sale_line_id, sl.product_id, sl.unit,
        sl.quantity_scaled as ordered_quantity_scaled,
        coalesce(delivery_facts.dispatched_quantity_scaled, 0) as dispatched_quantity_scaled,
        coalesce(delivery_facts.returned_quantity_scaled, 0) as returned_quantity_scaled,
        coalesce(delivery_facts.net_fulfilled_quantity_scaled, 0) as net_fulfilled_quantity_scaled,
        coalesce(delivery_facts.active_dispatched_remaining_quantity_scaled, 0)
          as active_dispatched_remaining_quantity_scaled,
        greatest(sl.quantity_scaled-coalesce(delivery_facts.net_fulfilled_quantity_scaled, 0), 0)
          as remaining_quantity_scaled,
        (coalesce(delivery_facts.invalid_unit, false)
          or coalesce(delivery_facts.net_fulfilled_quantity_scaled, 0)>sl.quantity_scaled
          or coalesce(delivery_facts.returned_quantity_scaled, 0)
            >coalesce(delivery_facts.dispatched_quantity_scaled, 0)) as integrity
      from sale_lines sl
      join candidate_scope scoped_candidate
        on scoped_candidate.kind='sale' and scoped_candidate.id=sl.sale_id
      left join delivery_facts
        on delivery_facts.workspace_id=sl.workspace_id and delivery_facts.sale_line_id=sl.id
    ), purchase_scoped_facts as (
      with recursive direct_received as (
        select prl.workspace_id, prl.purchase_line_id,
          coalesce(sum(prl.quantity_scaled), 0) as direct_received_net_quantity_scaled,
          coalesce(bool_or(prl.unit <> pl.unit or prl.product_id is distinct from pl.product_id), false)
            as invalid_direct_unit
        from purchase_receipt_lines prl
        join purchase_receipts pr on pr.workspace_id=prl.workspace_id and pr.id=prl.receipt_id
        join purchase_lines pl on pl.workspace_id=prl.workspace_id and pl.id=prl.purchase_line_id
        join candidate_scope scoped_candidate
          on scoped_candidate.kind='purchase' and scoped_candidate.id=pl.purchase_id
        left join purchase_receipt_reversals prr
          on prr.workspace_id=pr.workspace_id and prr.receipt_id=pr.id
        where prr.id is null
        group by prl.workspace_id, prl.purchase_line_id
      ), disposition_roots(workspace_id, disposition_id, purchase_line_id, product_id, unit) as (
        select qd.workspace_id, qd.id, gal.purchase_line_id, gal.product_id, gal.arrived_unit
        from quality_dispositions qd
        join goods_arrival_lines gal
          on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
        join candidate_scope scoped_candidate
          on scoped_candidate.kind='purchase' and scoped_candidate.id=gal.purchase_id
        join goods_arrivals ga on ga.workspace_id=gal.workspace_id and ga.id=gal.arrival_id
        left join goods_arrival_reversals gar
          on gar.workspace_id=ga.workspace_id and gar.arrival_id=ga.id
        left join quality_disposition_reversals qdr
          on qdr.workspace_id=qd.workspace_id and qdr.disposition_id=qd.id
        where qd.source_type='arrival_line' and gal.purchase_line_id is not null
          and gar.id is null and qdr.id is null
        union all
        select child.workspace_id, child.id, parent.purchase_line_id, parent.product_id, parent.unit
        from quality_dispositions child
        join quality_disposition_allocations source_allocation
          on source_allocation.workspace_id=child.workspace_id
          and source_allocation.id=child.source_quarantine_allocation_id
          and source_allocation.outcome='quarantined'
        join disposition_roots parent
          on parent.workspace_id=source_allocation.workspace_id
          and parent.disposition_id=source_allocation.disposition_id
        left join quality_disposition_reversals child_reversal
          on child_reversal.workspace_id=child.workspace_id
          and child_reversal.disposition_id=child.id
        where child.source_type='quarantine_allocation' and child_reversal.id is null
      ), inspected_accepted as (
        select qda.workspace_id, roots.purchase_line_id,
          coalesce(sum(qda.value_scaled), 0) as inspected_accepted_net_quantity_scaled,
          coalesce(bool_or(qda.unit <> pl.unit
            or roots.product_id is distinct from pl.product_id
            or roots.unit is distinct from pl.unit), false) as invalid_inspected_unit
        from quality_disposition_allocations qda
        join disposition_roots roots
          on roots.workspace_id=qda.workspace_id and roots.disposition_id=qda.disposition_id
        join purchase_lines pl on pl.workspace_id=roots.workspace_id and pl.id=roots.purchase_line_id
        left join quality_disposition_reversals qdr
          on qdr.workspace_id=qda.workspace_id and qdr.disposition_id=qda.disposition_id
        where qda.outcome='accepted' and qdr.id is null
        group by qda.workspace_id, roots.purchase_line_id
      )
      select pl.workspace_id, pl.purchase_id, pl.id as purchase_line_id, pl.product_id, pl.unit,
        pl.quantity_scaled as ordered_quantity_scaled,
        coalesce(direct_received.direct_received_net_quantity_scaled, 0)
          as direct_received_net_quantity_scaled,
        coalesce(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
          as inspected_accepted_net_quantity_scaled,
        coalesce(direct_received.direct_received_net_quantity_scaled, 0)
          + coalesce(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
          as received_net_quantity_scaled,
        greatest(pl.quantity_scaled
          - coalesce(direct_received.direct_received_net_quantity_scaled, 0)
          - coalesce(inspected_accepted.inspected_accepted_net_quantity_scaled, 0), 0)
          as remaining_quantity_scaled,
        (coalesce(direct_received.invalid_direct_unit, false)
          or coalesce(inspected_accepted.invalid_inspected_unit, false)
          or coalesce(direct_received.direct_received_net_quantity_scaled, 0)
            + coalesce(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
            > pl.quantity_scaled) as integrity
      from purchase_lines pl
      join candidate_scope scoped_candidate
        on scoped_candidate.kind='purchase' and scoped_candidate.id=pl.purchase_id
      left join direct_received
        on direct_received.workspace_id=pl.workspace_id and direct_received.purchase_line_id=pl.id
      left join inspected_accepted
        on inspected_accepted.workspace_id=pl.workspace_id
        and inspected_accepted.purchase_line_id=pl.id
    ),`
    : sql``;
  const paymentCtes = sql`
    payment_activity_events as (
      select p.workspace_id, p.id as payment_id, p.recorded_at
      from payments p
      where p.workspace_id=${input.workspaceId}::uuid
      union all
      select p.workspace_id, p.id as payment_id, pr.recorded_at
      from payment_reversals pr
      join payments p on p.workspace_id=pr.workspace_id and p.id=pr.payment_id
      where pr.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.payment_id, pa.recorded_at
      from payment_allocations pa
      where pa.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.payment_id, par.recorded_at
      from payment_allocation_reversals par
      join payment_allocations pa on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
      where par.workspace_id=${input.workspaceId}::uuid
      union all
      select cp.workspace_id, cp.payment_id, cp.recorded_at
      from customer_payment_credit_preservations cp
      where cp.workspace_id=${input.workspaceId}::uuid
    ), payment_activity as (
      select p.workspace_id, p.id,
        greatest(p.recorded_at, coalesce(events.recorded_at, p.recorded_at)) as updated_at
      from payments p
      left join (
        select workspace_id, payment_id, max(recorded_at) as recorded_at
        from payment_activity_events
        group by workspace_id, payment_id
      ) events on events.workspace_id=p.workspace_id and events.payment_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
    ),`;
  const candidateCtes = useFastPage
    ? sql`
    sale_event_rows as (
      select sv.workspace_id, sv.sale_id as id, sv.recorded_at as updated_at
      from sale_voids sv where sv.workspace_id=${input.workspaceId}::uuid
      union all
      select d.workspace_id, d.sale_id as id, d.recorded_at
      from deliveries d where d.workspace_id=${input.workspaceId}::uuid
      union all
      select d.workspace_id, d.sale_id as id, dr.recorded_at
      from delivery_returns dr
      join deliveries d on d.workspace_id=dr.workspace_id and d.id=dr.delivery_id
      where dr.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.sale_id as id, pa.recorded_at
      from payment_allocations pa where pa.workspace_id=${input.workspaceId}::uuid
      union all
      select pa.workspace_id, pa.sale_id as id, par.recorded_at
      from payment_allocation_reversals par
      join payment_allocations pa on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
      where par.workspace_id=${input.workspaceId}::uuid
    ), sale_event_latest as (
      select workspace_id, id, max(updated_at) as updated_at
      from sale_event_rows group by workspace_id, id
    ), purchase_disposition_roots_fast as (
      select qd.workspace_id, qd.id as disposition_id, gal.purchase_id
      from quality_dispositions qd
      join goods_arrival_lines gal
        on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
      where qd.workspace_id=${input.workspaceId}::uuid
        and qd.source_type='arrival_line' and gal.purchase_id is not null
      union all
      select child.workspace_id, child.id, parent.purchase_id
      from quality_dispositions child
      join quality_disposition_allocations source_allocation
        on source_allocation.workspace_id=child.workspace_id
        and source_allocation.id=child.source_quarantine_allocation_id
        and source_allocation.outcome='quarantined'
      join purchase_disposition_roots_fast parent
        on parent.workspace_id=source_allocation.workspace_id
        and parent.disposition_id=source_allocation.disposition_id
      where child.workspace_id=${input.workspaceId}::uuid
        and child.source_type='quarantine_allocation'
    ), purchase_event_rows as (
      select pv.workspace_id, pv.purchase_id as id, pv.recorded_at as updated_at
      from purchase_voids pv where pv.workspace_id=${input.workspaceId}::uuid
      union all
      select pr.workspace_id, pr.purchase_id as id, pr.recorded_at
      from purchase_receipts pr where pr.workspace_id=${input.workspaceId}::uuid
      union all
      select pr.workspace_id, pr.purchase_id as id, prr.recorded_at
      from purchase_receipt_reversals prr
      join purchase_receipts pr on pr.workspace_id=prr.workspace_id and pr.id=prr.receipt_id
      where prr.workspace_id=${input.workspaceId}::uuid
      union all
      select ga.workspace_id, ga.purchase_id as id, ga.recorded_at
      from goods_arrivals ga
      where ga.workspace_id=${input.workspaceId}::uuid and ga.purchase_id is not null
      union all
      select roots.workspace_id, roots.purchase_id as id, qd.recorded_at
      from quality_dispositions qd
      join purchase_disposition_roots_fast roots
        on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
      where qd.workspace_id=${input.workspaceId}::uuid
      union all
      select roots.workspace_id, roots.purchase_id as id, qdr.recorded_at
      from quality_disposition_reversals qdr
      join quality_dispositions qd
        on qd.workspace_id=qdr.workspace_id and qd.id=qdr.disposition_id
      join purchase_disposition_roots_fast roots
        on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
      where qdr.workspace_id=${input.workspaceId}::uuid
    ), purchase_event_latest as (
      select workspace_id, id, max(updated_at) as updated_at
      from purchase_event_rows group by workspace_id, id
    ), sale_candidates as (
      select id, kind, max(updated_at) as updated_at, max(amount) as amount,
        max(age_seconds) as age_seconds
      from (
        (select base.id, 'sale' as kind, base.updated_at, base.amount, base.age_seconds
        from (
          select s.id, greatest(s.recorded_at, coalesce(s.posted_at, s.recorded_at)) as updated_at,
            s.total_amount_minor as amount,
            extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds
          from sales s where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
        ) base
        where ${cursorClause}
        order by ${orderClause} limit ${limitClause})
        union all
        (select event.id, 'sale' as kind, event.updated_at, event.amount, event.age_seconds
        from (
          select s.id, greatest(s.recorded_at, coalesce(s.posted_at, s.recorded_at), events.updated_at)
              as updated_at,
            s.total_amount_minor as amount,
            extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds
          from sales s join sale_event_latest events
            on events.workspace_id=s.workspace_id and events.id=s.id
          where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
        ) event
        where ${cursorClause}
        order by ${orderClause} limit ${limitClause})
      ) candidates
      group by id, kind
    ), purchase_candidates as (
      select id, kind, max(updated_at) as updated_at, max(amount) as amount,
        max(age_seconds) as age_seconds
      from (
        (select base.id, 'purchase' as kind, base.updated_at, base.amount, base.age_seconds
        from (
          select p.id, greatest(p.recorded_at, coalesce(p.confirmed_at, p.recorded_at)) as updated_at,
            p.total_amount_minor as amount,
            extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds
          from purchases p where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
        ) base
        where ${cursorClause}
        order by ${orderClause} limit ${limitClause})
        union all
        (select event.id, 'purchase' as kind, event.updated_at, event.amount, event.age_seconds
        from (
          select p.id, greatest(p.recorded_at, coalesce(p.confirmed_at, p.recorded_at), events.updated_at)
              as updated_at,
            p.total_amount_minor as amount,
            extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds
          from purchases p join purchase_event_latest events
            on events.workspace_id=p.workspace_id and events.id=p.id
          where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
        ) event
        where ${cursorClause}
        order by ${orderClause} limit ${limitClause})
      ) candidates
      group by id, kind
    ), candidate_rows as (
      select * from sale_candidates
      union all select * from purchase_candidates
      union all
      select p.id, 'payment' as kind, payment_activity.updated_at,
        payment_exposure.available_amount_minor as amount,
        extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds
      from payments p
      join payment_activity on payment_activity.workspace_id=p.workspace_id and payment_activity.id=p.id
      join payment_exposure_v1 payment_exposure
        on payment_exposure.workspace_id=p.workspace_id and payment_exposure.payment_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
        and payment_exposure.available_amount_minor > 0
    ), candidate_scope as materialized (
      select candidate_rows.* from candidate_rows
      where ${cursorClause}
      order by ${orderClause} limit ${limitClause}
    ),`
    : sql``;
  const activityQueryCtes = useFastPage ? sql`` : activityCtes;
  const saleCandidateJoin = useFastPage
    ? sql`join candidate_scope sale_candidate on sale_candidate.kind='sale' and sale_candidate.id=s.id`
    : sql``;
  const purchaseCandidateJoin = useFastPage
    ? sql`join candidate_scope purchase_candidate on purchase_candidate.kind='purchase' and purchase_candidate.id=p.id`
    : sql``;
  const paymentCandidateJoin = useFastPage
    ? sql`join candidate_scope payment_candidate on payment_candidate.kind='payment' and payment_candidate.id=p.id`
    : sql``;
  const saleUpdatedAt = useFastPage
    ? sql`sale_candidate.updated_at`
    : options.includeActivity
      ? sql`sale_activity.updated_at`
      : sql`s.posted_at`;
  const purchaseUpdatedAt = useFastPage
    ? sql`purchase_candidate.updated_at`
    : options.includeActivity
      ? sql`purchase_activity.updated_at`
      : sql`p.confirmed_at`;
  const saleActivityJoin =
    options.includeActivity && !useFastPage
      ? sql`join sale_activity on sale_activity.workspace_id=s.workspace_id and sale_activity.id=s.id`
      : sql``;
  const purchaseActivityJoin =
    options.includeActivity && !useFastPage
      ? sql`join purchase_activity on purchase_activity.workspace_id=p.workspace_id and purchase_activity.id=p.id`
      : sql``;
  const rowsCte = options.includeCounts
    ? sql`
    searched_rows as (
      select board_rows.*
      from board_rows
      where ${searchClause}
    ), counted_rows as (
      select searched_rows.*,
        count(*) over() as all_count,
        count(*) filter (where physical_state='needs_receiving') over() as needs_receiving_count,
        count(*) filter (where physical_state='needs_delivery') over() as needs_delivery_count,
        count(*) filter (where physical_state='in_delivery') over() as in_delivery_count,
        count(*) filter (where returned_fulfilment) over() as returned_fulfilment_count,
        count(*) filter (where unallocated_payment) over() as unallocated_payment_count,
        count(*) filter (where financial_state='awaiting_payment') over() as awaiting_payment_count,
        count(*) filter (where financial_state='overdue') over() as overdue_count,
        count(*) filter (where physical_state in ('needs_delivery', 'in_delivery') and not returned_fulfilment and not fulfilment_remainder_unresolved and fulfilment_remainder_outcome is distinct from 'cancel_remainder') over() as outstanding_delivery_count,
        count(*) filter (where commercial_state='attention' or physical_state='attention' or financial_state='unallocated') over() as attention_count,
        count(*) filter (where fulfilment_remainder_unresolved) over() as fulfilment_remainder_unresolved_count,
        count(*) filter (where returned_fulfilment and not return_settlement_resolved) over() as return_settlement_unresolved_count,
        count(*) filter (where reconciliation_variance) over() as reconciliation_variance_count,
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
        count(*) filter (where financial_state='unallocated') over() as financial_unallocated_count,
        count(*) filter (where financial_state='awaiting_payment') over() as financial_awaiting_payment_count,
        count(*) filter (where financial_state='overdue') over() as financial_overdue_count,
        count(*) filter (where financial_state='voided') over() as financial_voided_count
      from searched_rows
    ), filtered_rows as (
      select counted_rows.*
      from counted_rows
      where ${filterClause}
    )`
    : sql`
    searched_rows as (
      select board_rows.*
      from board_rows
      where ${searchClause}
    ), filtered_rows as (
      select searched_rows.*
      from searched_rows
      where ${filterClause}
    )`;
  const rows = await tx.execute(sql`
    with recursive ${searchCtes} ${paymentCtes} ${activityQueryCtes} ${candidateCtes} ${scopedFactCtes} latest_delivery as (
      select distinct on (d.sale_id) d.sale_id, d.id as delivery_id
      from deliveries d
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      order by d.sale_id, d.transaction_time desc, d.recorded_at desc, d.id desc
    ), return_settlement_rollup as (
      select d.sale_id,
        bool_and(settled.return_id is not null) as all_resolved
      from delivery_returns dr
      join deliveries d on d.workspace_id=dr.workspace_id and d.id=dr.delivery_id
      left join (
        select distinct workspace_id, return_id
        from delivery_return_settlements
        where workspace_id=${input.workspaceId}::uuid
      ) settled on settled.workspace_id=dr.workspace_id and settled.return_id=dr.id
      where dr.workspace_id=${input.workspaceId}::uuid
      group by d.sale_id
    ), unresolved_return as (
      select distinct on (d.sale_id)
        d.sale_id,
        dr.id as return_id,
        d.id as delivery_id
      from delivery_returns dr
      join deliveries d on d.workspace_id=dr.workspace_id and d.id=dr.delivery_id
      left join (
        select distinct workspace_id, return_id
        from delivery_return_settlements
        where workspace_id=${input.workspaceId}::uuid
      ) settled on settled.workspace_id=dr.workspace_id and settled.return_id=dr.id
      where dr.workspace_id=${input.workspaceId}::uuid
        and settled.return_id is null
      order by d.sale_id, dr.recorded_at desc, dr.id desc
    ), return_settlement_status as (
      select rollup.sale_id,
        rollup.all_resolved,
        unresolved_return.return_id as unresolved_return_id,
        unresolved_return.delivery_id as unresolved_delivery_id
      from return_settlement_rollup rollup
      left join unresolved_return on unresolved_return.sale_id=rollup.sale_id
    ), fulfilment_remainder_status as (
      select distinct on (frc.sale_id)
        frc.sale_id,
        frc.case_kind,
        frc.outcome
      from fulfilment_remainder_cases frc
      where frc.workspace_id=${input.workspaceId}::uuid
        and not exists (
          select 1
          from fulfilment_remainder_cases successor
          where successor.workspace_id=frc.workspace_id
            and successor.related_case_id=frc.id
        )
      order by frc.sale_id, frc.recorded_at desc, frc.id desc
    ), sale_physical as (
      select s.id,
        case
          when bool_or(coalesce(sale_facts.integrity, false)) then 'attention'
          when coalesce(sum(coalesce(sale_facts.remaining_quantity_scaled, sl.quantity_scaled)),0)=0 then 'delivered'
          when coalesce(sum(sale_facts.active_dispatched_remaining_quantity_scaled),0)>0 then 'in_delivery'
          else 'needs_delivery'
        end as physical_state,
        bool_or(
          coalesce(sale_facts.returned_quantity_scaled, 0) > 0
          and sl.quantity_scaled > coalesce(sale_facts.net_fulfilled_quantity_scaled, 0)
        ) as returned_fulfilment,
        coalesce(
          max(return_settlement_status.unresolved_delivery_id::text)::uuid,
          max(latest_delivery.delivery_id::text)::uuid
        ) as delivery_id,
        max(return_settlement_status.unresolved_return_id::text)::uuid as return_id,
        coalesce(bool_or(return_settlement_status.all_resolved), false) as return_settlement_resolved,
        coalesce(
          bool_or(
            fulfilment_remainder_status.case_kind = 'opened'
            or fulfilment_remainder_status.outcome = 'commercial_correction'
          ),
          false
        ) as fulfilment_remainder_unresolved,
        max(fulfilment_remainder_status.outcome) as fulfilment_remainder_outcome
      from sales s ${saleSearchJoin} ${saleCandidateJoin} join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join ${useFastPage ? sql`sale_scoped_facts` : sql`sale_line_fulfilment_facts_v1`} sale_facts
        on sale_facts.workspace_id=sl.workspace_id and sale_facts.sale_line_id=sl.id
      left join latest_delivery on latest_delivery.sale_id=s.id
      left join return_settlement_status on return_settlement_status.sale_id=s.id
      left join fulfilment_remainder_status on fulfilment_remainder_status.sale_id=s.id
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
    ), purchase_received as (
      select purchase_id, purchase_line_id as line_id, ordered_quantity_scaled as quantity_scaled,
        received_net_quantity_scaled as received
      from ${useFastPage ? sql`purchase_scoped_facts` : sql`purchase_line_receiving_facts_v1`}
      where workspace_id=${input.workspaceId}::uuid
    ), purchase_physical as (
      select p.id, case when bool_and(pr.received >= pr.quantity_scaled) then 'received' else 'needs_receiving' end as physical_state
      from purchases p ${purchaseSearchJoin} ${purchaseCandidateJoin} join purchase_received pr on pr.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid group by p.id
    ), board_rows as (
    select s.id, 'sale' as kind, ('SALE-' || upper(substr(s.id::text,1,8))) as reference,
      c.display_name as counterparty, s.total_amount_minor as amount, s.currency,
      case when sv.id is not null then 'voided' when sale_physical.physical_state='attention' then 'attention' else 'posted' end as commercial_state,
      sale_physical.physical_state,
      case
        when sv.id is not null then 'voided'
        when coalesce(allocated.amount,0) >= s.total_amount_minor then 'paid'
        when s.due_at is not null and s.due_at < ${input.now}::timestamptz then 'overdue'
        else 'awaiting_payment'
      end as financial_state, s.due_at as due_at, sale_physical.returned_fulfilment, coalesce(sale_physical.return_settlement_resolved, false) as return_settlement_resolved,
      coalesce(sale_physical.fulfilment_remainder_unresolved, false) as fulfilment_remainder_unresolved,
      sale_physical.fulfilment_remainder_outcome::text as fulfilment_remainder_outcome,
      (sale_physical.physical_state='attention') as reconciliation_variance,
      false as unallocated_payment,
      null::bigint as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds, ${saleUpdatedAt} as updated_at,
      sale_physical.delivery_id, sale_physical.return_id, ('/sales/' || s.id::text) as href
    from sales s ${saleSearchJoin} ${saleCandidateJoin} join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
      join sale_physical on sale_physical.id=s.id left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id left join allocated on allocated.sale_id=s.id
      ${saleActivityJoin}
    where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
    union all
    select p.id, 'purchase' as kind, ('PUR-' || upper(substr(p.id::text,1,8))) as reference,
      s.display_name as counterparty, p.total_amount_minor as amount, p.currency,
      case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
      purchase_physical.physical_state, case when pv.id is null then 'payable' else 'voided' end as financial_state, null::timestamptz as due_at, false as returned_fulfilment,
      false as return_settlement_resolved,
      false as fulfilment_remainder_unresolved,
      null::text as fulfilment_remainder_outcome,
      false as reconciliation_variance,
      false as unallocated_payment,
      null::bigint as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds, ${purchaseUpdatedAt} as updated_at,
      null::uuid as delivery_id, null::uuid as return_id, ('/purchases/' || p.id::text) as href
    from purchases p ${purchaseSearchJoin} ${purchaseCandidateJoin} join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id join purchase_physical on purchase_physical.id=p.id
      ${purchaseActivityJoin}
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    union all
    select p.id, 'payment' as kind, ('PAY-' || upper(substr(p.id::text,1,8))) as reference,
      c.display_name as counterparty, payment_exposure.available_amount_minor as amount, p.currency,
      'not_applicable' as commercial_state, 'not_applicable' as physical_state,
      'unallocated' as financial_state, null::timestamptz as due_at, false as returned_fulfilment,
      false as return_settlement_resolved, false as fulfilment_remainder_unresolved,
      null::text as fulfilment_remainder_outcome, false as reconciliation_variance,
      true as unallocated_payment, payment_exposure.available_amount_minor as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds,
      payment_activity.updated_at,
      null::uuid as delivery_id, null::uuid as return_id, ('/payments/' || p.id::text) as href
    from payments p ${paymentSearchJoin} ${paymentCandidateJoin}
      join customers c on c.workspace_id=p.workspace_id and c.id=p.customer_id
      join payment_activity on payment_activity.workspace_id=p.workspace_id and payment_activity.id=p.id
      join payment_exposure_v1 payment_exposure
        on payment_exposure.workspace_id=p.workspace_id and payment_exposure.payment_id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
      and payment_exposure.available_amount_minor > 0
    ), ${rowsCte}
    select *
    from filtered_rows
    where ${cursorClause}
    order by ${orderClause}
    limit ${limitClause}
  `);
  const rawRows = rows as Row[],
    first = rawRows[0];
  const counts = {
    all: first === undefined ? 0 : numberOf(first, "all_count"),
    needsReceiving: first === undefined ? 0 : numberOf(first, "needs_receiving_count"),
    needsDelivery: first === undefined ? 0 : numberOf(first, "needs_delivery_count"),
    inDelivery: first === undefined ? 0 : numberOf(first, "in_delivery_count"),
    returnedFulfilment: first === undefined ? 0 : numberOf(first, "returned_fulfilment_count"),
    unallocatedPayment: first === undefined ? 0 : numberOf(first, "unallocated_payment_count"),
    awaitingPayment: first === undefined ? 0 : numberOf(first, "awaiting_payment_count"),
    overdue: first === undefined ? 0 : numberOf(first, "overdue_count"),
    overdueReceivable: first === undefined ? 0 : numberOf(first, "financial_overdue_count"),
    outstandingDelivery: first === undefined ? 0 : numberOf(first, "outstanding_delivery_count"),
    incompleteReceiving: first === undefined ? 0 : numberOf(first, "needs_receiving_count"),
    attention: first === undefined ? 0 : numberOf(first, "attention_count"),
    fulfilmentRemainderUnresolved:
      first === undefined ? 0 : numberOf(first, "fulfilment_remainder_unresolved_count"),
    returnSettlementUnresolved:
      first === undefined ? 0 : numberOf(first, "return_settlement_unresolved_count"),
    reconciliationVariance:
      first === undefined ? 0 : numberOf(first, "reconciliation_variance_count"),
    exceptionCounts: {
      outstanding_delivery: first === undefined ? 0 : numberOf(first, "outstanding_delivery_count"),
      incomplete_receiving: first === undefined ? 0 : numberOf(first, "needs_receiving_count"),
      unallocated_payment: first === undefined ? 0 : numberOf(first, "unallocated_payment_count"),
      overdue_receivable: first === undefined ? 0 : numberOf(first, "financial_overdue_count"),
      fulfilment_remainder_unresolved:
        first === undefined ? 0 : numberOf(first, "fulfilment_remainder_unresolved_count"),
      return_settlement_unresolved:
        first === undefined ? 0 : numberOf(first, "return_settlement_unresolved_count"),
      reconciliation_variance:
        first === undefined ? 0 : numberOf(first, "reconciliation_variance_count"),
    },
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
        ["unallocated", "financial_unallocated_count"],
        ["awaiting_payment", "financial_awaiting_payment_count"],
        ["overdue", "financial_overdue_count"],
        ["voided", "financial_voided_count"],
      ]),
    },
    rows: mapOperationsBoardRows(rawRows),
  };
}
