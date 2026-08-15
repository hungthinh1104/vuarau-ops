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
        ,coalesce(bool_or(return_settlement_status.all_resolved), false) as return_settlement_resolved
        ,coalesce(bool_or(fulfilment_remainder_status.case_kind = 'opened'), false) as fulfilment_remainder_unresolved
      from sales s
      join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
      left join sale_delivery_facts sdf on sdf.sale_line_id=sl.id
      left join return_settlement_status on return_settlement_status.sale_id=s.id
      left join fulfilment_remainder_status on fulfilment_remainder_status.sale_id=s.id
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
      select p.id, p.customer_id,
        greatest(p.amount_minor-p.reversed_amount_minor-coalesce(allocated_payment.amount,0)-coalesce(preserved_credit.amount,0),0) as amount
      from payments p
      left join allocated_payment on allocated_payment.payment_id=p.id
      left join preserved_credit_by_payment preserved_credit on preserved_credit.payment_id=p.id::text
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else 0 end),0) as received
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
        sp.return_settlement_resolved,
        sp.fulfilment_remainder_unresolved,
        (sp.physical_state='attention') as reconciliation_variance,
        false as unallocated_payment,
        case
          when sv.id is not null then 'voided'
          when coalesce(a.amount,0) >= s.total_amount_minor then 'paid'
          when s.due_at is not null and s.due_at < ${input.now}::timestamptz then 'overdue'
          else 'awaiting_payment'
        end as financial_state
      from sales s
      join sale_physical sp on sp.id=s.id
      left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
      left join allocated a on a.sale_id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
      union all
      select p.id, 'purchase' as kind,
        case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
        pp.physical_state,
        false as returned_fulfilment,
        false as return_settlement_resolved,
        false as fulfilment_remainder_unresolved,
        false as reconciliation_variance,
        false as unallocated_payment,
        case when pv.id is null then 'payable' else 'voided' end as financial_state
      from purchases p
      join purchase_physical pp on pp.id=p.id
      left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
      union all
      select p.id, 'payment' as kind,
        'not_applicable' as commercial_state,
        'not_applicable' as physical_state,
        false as returned_fulfilment,
        false as return_settlement_resolved,
        false as fulfilment_remainder_unresolved,
        false as reconciliation_variance,
        true as unallocated_payment,
        'unallocated' as financial_state
      from payments p
      join payment_remaining remaining on remaining.id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed' and remaining.amount > 0
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
      count(*) filter (where financial_state='overdue')::int as overdue_receivable_count,
      count(*) filter (where physical_state in ('needs_delivery', 'in_delivery') and not returned_fulfilment and not fulfilment_remainder_unresolved)::int as outstanding_delivery_count,
      count(*) filter (where physical_state='needs_receiving')::int as incomplete_receiving_count,
      count(*) filter (where commercial_state='attention' or physical_state='attention' or financial_state='unallocated')::int as attention_count,
      count(*) filter (where fulfilment_remainder_unresolved)::int as fulfilment_remainder_unresolved_count,
      count(*) filter (where returned_fulfilment and not return_settlement_resolved)::int as return_settlement_unresolved_count,
      count(*) filter (where reconciliation_variance)::int as reconciliation_variance_count,
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
      count(*) filter (where financial_state='unallocated')::int as financial_unallocated_count,
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
      overdueReceivable: count("overdue_receivable_count"),
      outstandingDelivery: count("outstanding_delivery_count"),
      incompleteReceiving: count("incomplete_receiving_count"),
      attention: count("attention_count"),
      fulfilmentRemainderUnresolved: count("fulfilment_remainder_unresolved_count"),
      returnSettlementUnresolved: count("return_settlement_unresolved_count"),
      reconciliationVariance: count("reconciliation_variance_count"),
      exceptionCounts: {
        outstanding_delivery: count("outstanding_delivery_count"),
        incomplete_receiving: count("incomplete_receiving_count"),
        unallocated_payment: count("unallocated_payment_count"),
        overdue_receivable: count("overdue_receivable_count"),
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
        ["unallocated", "financial_unallocated_count"],
        ["awaiting_payment", "financial_awaiting_payment_count"],
        ["overdue", "financial_overdue_count"],
        ["voided", "financial_voided_count"],
      ]),
    },
  };
}
