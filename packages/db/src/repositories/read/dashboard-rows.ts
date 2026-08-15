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
      ? sql`physical_state in ('needs_delivery', 'in_delivery') and not returned_fulfilment and not fulfilment_remainder_unresolved`
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
      select dc.workspace_id, dc.payment_reference::uuid, dc.recorded_at
      from debt_observations dc
      where dc.workspace_id=${input.workspaceId}::uuid and dc.kind='customer_credit_preserved'
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
    ), payment_allocated as (
      select pa.workspace_id, pa.payment_id,
        coalesce(sum(pa.amount_minor-coalesce(reversed.amount,0)),0) as amount
      from payment_allocations pa
      left join (
        select par.workspace_id, par.allocation_id, coalesce(sum(par.amount_minor),0) as amount
        from payment_allocation_reversals par
        where par.workspace_id=${input.workspaceId}::uuid
        group by par.workspace_id, par.allocation_id
      ) reversed on reversed.workspace_id=pa.workspace_id and reversed.allocation_id=pa.id
      where pa.workspace_id=${input.workspaceId}::uuid
      group by pa.workspace_id, pa.payment_id
    ), preserved_credit_by_payment as (
      select dc.payment_reference as payment_id, coalesce(sum(dc.amount_minor),0) as amount
      from debt_observations dc
      where dc.workspace_id=${input.workspaceId}::uuid
        and dc.kind='customer_credit_preserved'
        and not exists (
          select 1 from debt_observations successor
          where successor.workspace_id=dc.workspace_id and successor.related_observation_id=dc.id
        )
      group by dc.payment_reference
    ), payment_remaining as (
      select p.workspace_id, p.id,
        greatest(p.amount_minor-p.reversed_amount_minor-coalesce(allocated.amount,0)-coalesce(preserved.amount,0),0) as amount
      from payments p
      left join payment_allocated allocated on allocated.workspace_id=p.workspace_id and allocated.payment_id=p.id
      left join preserved_credit_by_payment preserved on preserved.payment_id=p.id::text
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
    ),`;
  const candidateCtes = useFastPage
    ? sql`
    candidate_rows as (
      select s.id, 'sale' as kind, sale_activity.updated_at,
        s.total_amount_minor as amount,
        extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds
      from sales s
      join sale_activity on sale_activity.workspace_id=s.workspace_id and sale_activity.id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      union all
      select p.id, 'purchase' as kind, purchase_activity.updated_at,
        p.total_amount_minor as amount,
        extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds
      from purchases p
      join purchase_activity on purchase_activity.workspace_id=p.workspace_id and purchase_activity.id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
      union all
      select p.id, 'payment' as kind, payment_activity.updated_at,
        remaining.amount as amount,
        extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds
      from payments p
      join payment_activity on payment_activity.workspace_id=p.workspace_id and payment_activity.id=p.id
      join payment_remaining remaining on remaining.workspace_id=p.workspace_id and remaining.id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed' and remaining.amount > 0
    ), candidate_scope as (
      select candidate_rows.*
      from candidate_rows
      where ${cursorClause}
      order by ${orderClause}
      limit ${limitClause}
    ),`
    : sql``;
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
        count(*) filter (where physical_state in ('needs_delivery', 'in_delivery') and not returned_fulfilment and not fulfilment_remainder_unresolved) over() as outstanding_delivery_count,
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
    with recursive ${searchCtes} ${paymentCtes} delivered as (
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
    ), return_settlement_status as (
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
    ), fulfilment_remainder_status as (
      select distinct on (frc.sale_id)
        frc.sale_id,
        frc.case_kind,
        frc.outcome
      from fulfilment_remainder_cases frc
      where frc.workspace_id=${input.workspaceId}::uuid
      order by frc.sale_id, frc.transaction_time desc, frc.recorded_at desc, frc.id desc
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
        bool_or(
          coalesce(returned.returned, 0) > 0
          and sl.quantity_scaled > coalesce(delivered.dispatched, 0) - coalesce(returned.returned, 0)
        ) as returned_fulfilment,
        max(latest_delivery.delivery_id::text)::uuid as delivery_id,
        coalesce(bool_or(return_settlement_status.all_resolved), false) as return_settlement_resolved,
        coalesce(bool_or(fulfilment_remainder_status.case_kind = 'opened'), false) as fulfilment_remainder_unresolved,
        max(fulfilment_remainder_status.outcome) as fulfilment_remainder_outcome
      from sales s ${saleSearchJoin} ${saleCandidateJoin} join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join delivered on delivered.sale_line_id=sl.id
      left join returned on returned.sale_line_id=sl.id
      left join dispatched_remaining on dispatched_remaining.sale_line_id=sl.id
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
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else 0 end),0) as received
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
    ), ${activityCtes} ${candidateCtes} purchase_physical as (
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
      case
        when sv.id is not null then null
        when sale_physical.physical_state='attention' then 'Kiểm tra'
        when sale_physical.returned_fulfilment and not coalesce(sale_physical.return_settlement_resolved, false) then 'Xử lý hàng trả'
        when coalesce(sale_physical.fulfilment_remainder_unresolved, false) then 'Mở Sale để quyết định phần còn lại.'
        when sale_physical.fulfilment_remainder_outcome='commercial_correction' then 'Mở Sale để điều chỉnh thương mại.'
        when sale_physical.physical_state='needs_delivery' then 'Giao hàng'
        when sale_physical.physical_state='in_delivery' then 'Theo dõi giao hàng'
        when coalesce(allocated.amount,0) < s.total_amount_minor then 'Thu tiền'
        else null
      end as next_action,
      sale_physical.delivery_id, ('/sales/' || s.id::text) as href
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
      case when pv.id is not null then null when purchase_physical.physical_state='needs_receiving' then 'Nhận hàng' else null end as next_action,
      null::uuid as delivery_id, ('/purchases/' || p.id::text) as href
    from purchases p ${purchaseSearchJoin} ${purchaseCandidateJoin} join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id join purchase_physical on purchase_physical.id=p.id
      ${purchaseActivityJoin}
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    union all
    select p.id, 'payment' as kind, ('PAY-' || upper(substr(p.id::text,1,8))) as reference,
      c.display_name as counterparty, remaining.amount::bigint as amount, p.currency,
      'not_applicable' as commercial_state, 'not_applicable' as physical_state,
      'unallocated' as financial_state, null::timestamptz as due_at, false as returned_fulfilment,
      false as return_settlement_resolved, false as fulfilment_remainder_unresolved,
      null::text as fulfilment_remainder_outcome, false as reconciliation_variance,
      true as unallocated_payment, remaining.amount::bigint as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds,
      payment_activity.updated_at,
      'Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.' as next_action,
      null::uuid as delivery_id, ('/payments/' || p.id::text) as href
    from payments p ${paymentSearchJoin} ${paymentCandidateJoin}
      join customers c on c.workspace_id=p.workspace_id and c.id=p.customer_id
      join payment_activity on payment_activity.workspace_id=p.workspace_id and payment_activity.id=p.id
      join payment_remaining remaining on remaining.workspace_id=p.workspace_id and remaining.id=p.id
    where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed' and remaining.amount > 0
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
