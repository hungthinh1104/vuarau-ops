import { sql } from "drizzle-orm";
import type { OperationsBoardCountsInput } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
type Row = Record<string, unknown>;
const numberOf = (row: Row, name: string): number =>
  persistedBigintToSafeNumber(row[name] ?? 0, `dashboard ${name}`);
function statusCounts(row: Row | undefined, entries: readonly (readonly [string, string])[]) {
  if (row === undefined) return [];
  return entries
    .map(([key, column]) => ({ key, count: numberOf(row, column) }))
    .filter((entry) => entry.count > 0);
}
export async function queryOperationsBoardCounts(
  tx: Tx,
  input: OperationsBoardCountsInput & { readonly now: string },
) {
  const rows = await tx.execute(sql`
    with recursive
    delivery_line_returns as (
      select drl.delivery_line_id, coalesce(sum(drl.quantity_scaled), 0) as returned
      from delivery_return_lines drl
      join delivery_returns dr
        on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
      where dr.workspace_id=${input.workspaceId}::uuid
      group by drl.delivery_line_id
    ), sale_delivery_facts as (
      select dl.sale_line_id,
        coalesce(sum(case when d.status in ('dispatched','delivered') then dl.quantity_scaled else 0 end),0) as dispatched,
        coalesce(sum(case when d.status='dispatched' then greatest(dl.quantity_scaled-coalesce(dlr.returned,0),0) else 0 end),0) as in_delivery,
        coalesce(sum(dlr.returned),0) as returned
      from delivery_lines dl
      join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      left join delivery_line_returns dlr on dlr.delivery_line_id=dl.id
      where dl.workspace_id=${input.workspaceId}::uuid
      group by dl.sale_line_id
    ), sale_physical as (
      select s.id,
        case
          when bool_or(coalesce(sdf.dispatched,0)-coalesce(sdf.returned,0) > sl.quantity_scaled) then 'attention'
          when coalesce(sum(greatest(sl.quantity_scaled-coalesce(sdf.dispatched,0)+coalesce(sdf.returned,0),0)),0)=0 then 'delivered'
          when coalesce(sum(sdf.in_delivery),0)>0 then 'in_delivery'
          else 'needs_delivery'
        end as physical_state
        ,bool_or(
          coalesce(sdf.returned, 0) > 0
          and sl.quantity_scaled > coalesce(sdf.dispatched, 0) - coalesce(sdf.returned, 0)
        ) as returned_fulfilment
      from sales s
      join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join sale_delivery_facts sdf on sdf.sale_line_id=sl.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      group by s.id
    ), allocation_reversals as (
      select par.workspace_id, par.allocation_id, coalesce(sum(par.amount_minor),0) as amount
      from payment_allocation_reversals par
      where par.workspace_id=${input.workspaceId}::uuid
      group by par.workspace_id, par.allocation_id
    ), allocation_facts as (
      select pa.payment_id, pa.sale_id, coalesce(sum(pa.amount_minor-coalesce(ar.amount,0)),0) as amount
      from payment_allocations pa
      left join allocation_reversals ar
        on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
      where pa.workspace_id=${input.workspaceId}::uuid
      group by pa.payment_id, pa.sale_id
    ), allocated as (
      select sale_id, coalesce(sum(amount),0) as amount
      from allocation_facts
      group by sale_id
    ), allocated_payment as (
      select payment_id, coalesce(sum(amount),0) as amount
      from allocation_facts
      group by payment_id
    ), unallocated_by_customer as (
      select p.customer_id,
        coalesce(sum(greatest(p.amount_minor-p.reversed_amount_minor-coalesce(allocated_payment.amount,0),0)),0) as amount
      from payments p
      left join allocated_payment on allocated_payment.payment_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
      group by p.customer_id
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else -prl.quantity_scaled end),0) as received
      from purchase_receipt_lines prl
      join purchase_receipts pr on pr.workspace_id=prl.workspace_id and pr.id=prl.receipt_id
      left join purchase_receipt_reversals prr
        on prr.workspace_id=pr.workspace_id and prr.receipt_id=pr.id
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
      select qda.workspace_id, roots.purchase_line_id, coalesce(sum(qda.value_scaled),0) as accepted
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
    ), purchase_physical as (
      select p.id,
        case when bool_and(coalesce(direct.received,0)+coalesce(inspected.accepted,0) >= pl.quantity_scaled)
          then 'received' else 'needs_receiving' end as physical_state
      from purchases p
      join purchase_lines pl on pl.workspace_id=p.workspace_id and pl.purchase_id=p.id
      left join direct_received direct
        on direct.workspace_id=pl.workspace_id and direct.purchase_line_id=pl.id
      left join inspected_accepted inspected
        on inspected.workspace_id=pl.workspace_id and inspected.purchase_line_id=pl.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
      group by p.id
    ), classified as (
      select s.id, 'sale' as kind,
        case when sv.id is not null then 'voided'
          when sp.physical_state='attention' then 'attention' else 'posted' end as commercial_state,
        sp.physical_state,
        sp.returned_fulfilment,
        coalesce(u.amount,0) > 0 as unallocated_payment,
        case
          when sv.id is not null then 'voided'
          when coalesce(u.amount,0) > 0 then 'reconciliation_required'
          when coalesce(a.amount,0) >= s.total_amount_minor then 'paid'
          when s.due_at is not null and s.due_at < ${input.now}::timestamptz then 'overdue'
          else 'awaiting_payment'
        end as financial_state
      from sales s
      join sale_physical sp on sp.id=s.id
      left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      left join allocated a on a.sale_id=s.id
      left join unallocated_by_customer u on u.customer_id=s.customer_id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      union all
      select p.id, 'purchase' as kind,
        case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
        pp.physical_state,
        false as returned_fulfilment,
        false as unallocated_payment,
        case when pv.id is null then 'payable' else 'voided' end as financial_state
      from purchases p
      join purchase_physical pp on pp.id=p.id
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    )
    select
      count(*)::int as all_count,
      count(*) filter (where physical_state='needs_receiving')::int as needs_receiving_count,
      count(*) filter (where physical_state='needs_delivery')::int as needs_delivery_count,
      count(*) filter (where physical_state='in_delivery')::int as in_delivery_count,
      count(*) filter (where returned_fulfilment)::int as returned_fulfilment_count,
      count(*) filter (where unallocated_payment)::int as unallocated_payment_count,
      count(*) filter (where financial_state='awaiting_payment')::int as awaiting_payment_count,
      count(*) filter (where financial_state='overdue')::int as overdue_count,
      count(*) filter (where commercial_state='attention' or physical_state='attention' or financial_state='reconciliation_required')::int as attention_count,
      0::int as fulfilment_remainder_unresolved_count,
      count(*) filter (where returned_fulfilment)::int as return_settlement_unresolved_count,
      count(*) filter (where commercial_state='attention' or physical_state='attention' or (financial_state='reconciliation_required' and not unallocated_payment))::int as reconciliation_variance_count,
      count(*) filter (where commercial_state='posted')::int as commercial_posted_count,
      count(*) filter (where commercial_state='confirmed')::int as commercial_confirmed_count,
      count(*) filter (where commercial_state='voided')::int as commercial_voided_count,
      count(*) filter (where commercial_state='attention')::int as commercial_attention_count,
      count(*) filter (where physical_state='needs_receiving')::int as physical_needs_receiving_count,
      count(*) filter (where physical_state='needs_delivery')::int as physical_needs_delivery_count,
      count(*) filter (where physical_state='in_delivery')::int as physical_in_delivery_count,
      count(*) filter (where physical_state='delivered')::int as physical_delivered_count,
      count(*) filter (where physical_state='received')::int as physical_received_count,
      count(*) filter (where physical_state='attention')::int as physical_attention_count,
      count(*) filter (where financial_state='paid')::int as financial_paid_count,
      count(*) filter (where financial_state='payable')::int as financial_payable_count,
      count(*) filter (where financial_state='reconciliation_required')::int as financial_reconciliation_required_count,
      count(*) filter (where financial_state='awaiting_payment')::int as financial_awaiting_payment_count,
      count(*) filter (where financial_state='overdue')::int as financial_overdue_count,
      count(*) filter (where financial_state='voided')::int as financial_voided_count
    from classified
  `);
  const row = (rows[0] ?? {}) as Row;
  const count = (name: string) => numberOf(row, name);
  return {
    counts: {
      all: count("all_count"),
      needsReceiving: count("needs_receiving_count"),
      needsDelivery: count("needs_delivery_count"),
      inDelivery: count("in_delivery_count"),
      returnedFulfilment: count("returned_fulfilment_count"),
      unallocatedPayment: count("unallocated_payment_count"),
      awaitingPayment: count("awaiting_payment_count"),
      overdue: count("overdue_count"),
      attention: count("attention_count"),
      fulfilmentRemainderUnresolved: count("fulfilment_remainder_unresolved_count"),
      returnSettlementUnresolved: count("return_settlement_unresolved_count"),
      reconciliationVariance: count("reconciliation_variance_count"),
      exceptionCounts: {
        unallocated_payment: count("unallocated_payment_count"),
        fulfilment_remainder_unresolved: count("fulfilment_remainder_unresolved_count"),
        return_settlement_unresolved: count("return_settlement_unresolved_count"),
        reconciliation_variance: count("reconciliation_variance_count"),
      },
    },
    statusCounts: {
      commercial: statusCounts(row, [
        ["posted", "commercial_posted_count"],
        ["confirmed", "commercial_confirmed_count"],
        ["voided", "commercial_voided_count"],
        ["attention", "commercial_attention_count"],
      ]),
      physical: statusCounts(row, [
        ["needs_receiving", "physical_needs_receiving_count"],
        ["needs_delivery", "physical_needs_delivery_count"],
        ["in_delivery", "physical_in_delivery_count"],
        ["delivered", "physical_delivered_count"],
        ["received", "physical_received_count"],
        ["attention", "physical_attention_count"],
      ]),
      financial: statusCounts(row, [
        ["paid", "financial_paid_count"],
        ["payable", "financial_payable_count"],
        ["reconciliation_required", "financial_reconciliation_required_count"],
        ["awaiting_payment", "financial_awaiting_payment_count"],
        ["overdue", "financial_overdue_count"],
        ["voided", "financial_voided_count"],
      ]),
    },
  };
}

export async function queryOperationsBoardCountsSplit(
  tx: Tx,
  input: OperationsBoardCountsInput & { readonly now: string },
) {
  const [saleRows, financialRows, purchaseRows] = await Promise.all([
    tx.execute(sql`
      with delivery_line_returns as (
        select drl.delivery_line_id, coalesce(sum(drl.quantity_scaled),0) as returned
        from delivery_return_lines drl
        join delivery_returns dr on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
        where dr.workspace_id=${input.workspaceId}::uuid
        group by drl.delivery_line_id
      ), sale_physical as (
        select sl.sale_id as id,
          case
            when bool_or(coalesce(slf.dispatched,0)-coalesce(slf.returned,0) > sl.quantity_scaled) then 'attention'
            when coalesce(sum(greatest(sl.quantity_scaled-coalesce(slf.dispatched,0)+coalesce(slf.returned,0),0)),0)=0 then 'delivered'
            when coalesce(bool_or(slf.in_delivery > 0),false) then 'in_delivery'
            else 'needs_delivery'
          end as physical_state,
          bool_or(
            coalesce(slf.returned, 0) > 0
            and sl.quantity_scaled > coalesce(slf.dispatched, 0) - coalesce(slf.returned, 0)
          ) as returned_fulfilment
        from sale_lines sl
        left join (
          select dl.sale_line_id,
            coalesce(sum(case when d.status in ('dispatched','delivered') then dl.quantity_scaled else 0 end),0) as dispatched,
            coalesce(sum(case when d.status='dispatched' then greatest(dl.quantity_scaled-coalesce(dlr.returned,0),0) else 0 end),0) as in_delivery,
            coalesce(sum(dlr.returned),0) as returned
          from delivery_lines dl
          join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
          left join delivery_line_returns dlr on dlr.delivery_line_id=dl.id
          where dl.workspace_id=${input.workspaceId}::uuid
          group by dl.sale_line_id
        ) slf on slf.sale_line_id=sl.id
        where sl.workspace_id=${input.workspaceId}::uuid
        group by sl.sale_id
      ), allocation_reversals as (
        select par.workspace_id, par.allocation_id, coalesce(sum(par.amount_minor),0) as amount
        from payment_allocation_reversals par
        where par.workspace_id=${input.workspaceId}::uuid
        group by par.workspace_id, par.allocation_id
      ), allocation_facts as (
        select pa.payment_id, coalesce(sum(pa.amount_minor-coalesce(ar.amount,0)),0) as amount
        from payment_allocations pa
        left join allocation_reversals ar
          on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
        where pa.workspace_id=${input.workspaceId}::uuid
        group by pa.payment_id
      ), unallocated_by_customer as (
        select p.customer_id,
          coalesce(sum(greatest(p.amount_minor-p.reversed_amount_minor-coalesce(af.amount,0),0)),0) as amount
        from payments p
        left join allocation_facts af on af.payment_id=p.id
        where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
        group by p.customer_id
      )
      select
        count(*)::int as all_count,
        count(*) filter (where physical_state='needs_delivery')::int as needs_delivery_count,
        count(*) filter (where physical_state='in_delivery')::int as in_delivery_count,
        count(*) filter (where returned_fulfilment)::int as returned_fulfilment_count,
        0::int as fulfilment_remainder_unresolved_count,
        count(*) filter (where physical_state='delivered')::int as delivered_count,
        count(*) filter (where physical_state='attention')::int as physical_attention_count,
        count(*) filter (where sv.id is not null)::int as voided_count,
        count(*) filter (where physical_state='attention' or (sv.id is null and coalesce(u.amount,0) > 0))::int as attention_count,
        count(*) filter (where returned_fulfilment)::int as return_settlement_unresolved_count,
        count(*) filter (where physical_state='attention')::int as reconciliation_variance_count,
        count(*) filter (where physical_state='attention' and sv.id is null)::int as commercial_attention_count
      from sale_physical
      join sales s on s.workspace_id=${input.workspaceId}::uuid and s.id=sale_physical.id
      left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      left join unallocated_by_customer u on u.customer_id=s.customer_id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
    `),
    tx.execute(sql`
      with allocation_reversals as (
        select par.workspace_id, par.allocation_id, coalesce(sum(par.amount_minor),0) as amount
        from payment_allocation_reversals par
        where par.workspace_id=${input.workspaceId}::uuid
        group by par.workspace_id, par.allocation_id
      ), allocation_facts as (
        select pa.payment_id, pa.sale_id, coalesce(sum(pa.amount_minor-coalesce(ar.amount,0)),0) as amount
        from payment_allocations pa
        left join allocation_reversals ar on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
        where pa.workspace_id=${input.workspaceId}::uuid
        group by pa.payment_id, pa.sale_id
      ), allocated as (
        select sale_id, coalesce(sum(amount),0) as amount
        from allocation_facts group by sale_id
      ), allocated_payment as (
        select payment_id, coalesce(sum(amount),0) as amount
        from allocation_facts group by payment_id
      ), unallocated_by_customer as (
        select p.customer_id,
          coalesce(sum(greatest(p.amount_minor-p.reversed_amount_minor-coalesce(ap.amount,0),0)),0) as amount
        from payments p
        left join allocated_payment ap on ap.payment_id=p.id
        where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
        group by p.customer_id
      )
      select
        count(*) filter (where coalesce(u.amount,0) > 0)::int as unallocated_payment_count,
        count(*) filter (where sv.id is null and coalesce(u.amount,0) > 0)::int as reconciliation_required_count,
        count(*) filter (where sv.id is null and coalesce(u.amount,0) = 0 and coalesce(a.amount,0) >= s.total_amount_minor)::int as paid_count,
        count(*) filter (where sv.id is null and coalesce(u.amount,0) = 0 and coalesce(a.amount,0) < s.total_amount_minor and s.due_at is not null and s.due_at < ${input.now}::timestamptz)::int as overdue_count,
        count(*) filter (where sv.id is null and coalesce(u.amount,0) = 0 and coalesce(a.amount,0) < s.total_amount_minor and (s.due_at is null or s.due_at >= ${input.now}::timestamptz))::int as awaiting_payment_count
      from sales s
      left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      left join allocated a on a.sale_id=s.id
      left join unallocated_by_customer u on u.customer_id=s.customer_id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
    `),
    tx.execute(sql`
      with recursive direct_received as (
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
        join goods_arrival_lines gal on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
        where qd.workspace_id=${input.workspaceId}::uuid and qd.source_type='arrival_line'
        union all
        select child.workspace_id, child.id, parent.purchase_line_id
        from quality_dispositions child
        join quality_disposition_allocations source_allocation
          on source_allocation.workspace_id=child.workspace_id
          and source_allocation.id=child.source_quarantine_allocation_id
          and source_allocation.outcome='quarantined'
        join disposition_roots parent
          on parent.workspace_id=source_allocation.workspace_id and parent.disposition_id=source_allocation.disposition_id
        where child.workspace_id=${input.workspaceId}::uuid and child.source_type='quarantine_allocation'
      ), inspected_accepted as (
        select qda.workspace_id, roots.purchase_line_id, coalesce(sum(qda.value_scaled),0) as accepted
        from quality_disposition_allocations qda
        join quality_dispositions qd on qd.workspace_id=qda.workspace_id and qd.id=qda.disposition_id
        join disposition_roots roots on roots.workspace_id=qd.workspace_id and roots.disposition_id=qd.id
        left join quality_disposition_reversals qdr on qdr.workspace_id=qd.workspace_id and qdr.disposition_id=qd.id
        where qda.workspace_id=${input.workspaceId}::uuid and qda.outcome='accepted' and qdr.id is null
        group by qda.workspace_id, roots.purchase_line_id
      ), purchase_physical as (
        select p.id,
          case when bool_and(coalesce(dr.received,0)+coalesce(ia.accepted,0) >= pl.quantity_scaled)
            then 'received' else 'needs_receiving' end as physical_state
        from purchases p
        join purchase_lines pl on pl.workspace_id=p.workspace_id and pl.purchase_id=p.id
        left join direct_received dr on dr.workspace_id=pl.workspace_id and dr.purchase_line_id=pl.id
        left join inspected_accepted ia on ia.workspace_id=pl.workspace_id and ia.purchase_line_id=pl.id
        where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
        group by p.id
      )
      select
        count(*)::int as all_count,
        count(*) filter (where physical_state='needs_receiving')::int as needs_receiving_count,
        count(*) filter (where physical_state='received')::int as received_count,
        count(*) filter (where pv.id is null)::int as confirmed_count,
        count(*) filter (where pv.id is not null)::int as voided_count
      from purchases p
      join purchase_physical pp on pp.id=p.id
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    `),
  ]);
  const sale = (saleRows[0] ?? {}) as Row;
  const financial = (financialRows[0] ?? {}) as Row;
  const purchase = (purchaseRows[0] ?? {}) as Row;
  const value = (row: Row, name: string) => numberOf(row, name);
  const saleAll = value(sale, "all_count");
  const purchaseAll = value(purchase, "all_count");
  return {
    counts: {
      all: saleAll + purchaseAll,
      needsReceiving: value(purchase, "needs_receiving_count"),
      needsDelivery: value(sale, "needs_delivery_count"),
      inDelivery: value(sale, "in_delivery_count"),
      returnedFulfilment: value(sale, "returned_fulfilment_count"),
      unallocatedPayment: value(financial, "unallocated_payment_count"),
      awaitingPayment: value(financial, "awaiting_payment_count"),
      overdue: value(financial, "overdue_count"),
      attention: value(sale, "attention_count"),
      incompleteReceiving: value(purchase, "needs_receiving_count"),
      fulfilmentRemainderUnresolved: value(sale, "fulfilment_remainder_unresolved_count"),
      returnSettlementUnresolved: value(sale, "return_settlement_unresolved_count"),
      reconciliationVariance:
        value(sale, "reconciliation_variance_count") +
        value(financial, "reconciliation_variance_count"),
      exceptionCounts: {
        unallocated_payment: value(financial, "unallocated_payment_count"),
        fulfilment_remainder_unresolved: value(sale, "fulfilment_remainder_unresolved_count"),
        return_settlement_unresolved: value(sale, "return_settlement_unresolved_count"),
        reconciliation_variance:
          value(sale, "reconciliation_variance_count") +
          value(financial, "reconciliation_variance_count"),
      },
    },
    statusCounts: {
      commercial: [
        {
          key: "posted",
          count: saleAll - value(sale, "voided_count") - value(sale, "commercial_attention_count"),
        },
        { key: "confirmed", count: value(purchase, "confirmed_count") },
        {
          key: "voided",
          count: value(sale, "voided_count") + value(purchase, "voided_count"),
        },
        { key: "attention", count: value(sale, "commercial_attention_count") },
      ].filter((entry) => entry.count > 0),
      physical: [
        { key: "needs_receiving", count: value(purchase, "needs_receiving_count") },
        { key: "needs_delivery", count: value(sale, "needs_delivery_count") },
        { key: "in_delivery", count: value(sale, "in_delivery_count") },
        { key: "delivered", count: value(sale, "delivered_count") },
        { key: "received", count: value(purchase, "received_count") },
        { key: "attention", count: value(sale, "physical_attention_count") },
      ].filter((entry) => entry.count > 0),
      financial: [
        { key: "paid", count: value(financial, "paid_count") },
        { key: "payable", count: purchaseAll - value(purchase, "voided_count") },
        {
          key: "reconciliation_required",
          count: value(financial, "reconciliation_required_count"),
        },
        { key: "awaiting_payment", count: value(financial, "awaiting_payment_count") },
        { key: "overdue", count: value(financial, "overdue_count") },
        {
          key: "voided",
          count: value(sale, "voided_count") + value(purchase, "voided_count"),
        },
      ].filter((entry) => entry.count > 0),
    },
  };
}
