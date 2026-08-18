import { sql, type SQL } from "drizzle-orm";
import type { CursorPosition, OperationsBoardInput } from "@vuarau/domain-contracts";

export function buildActivityCtes(
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
  saleSearchJoin: SQL,
  purchaseSearchJoin: SQL,
): SQL {
  return sql`
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
    ),`;
}

export function buildScopedFactCtes(): SQL {
  // This is a deliberately candidate-scoped performance projection, not a
  // second business rule. Its arithmetic must stay byte-for-byte aligned with
  // sale_line_fulfilment_facts_v1 and purchase_line_receiving_facts_v1; the DB
  // parity suite is the guard before changing either projection.
  return sql`
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
            or dl.quality_grade_id is distinct from sl.quality_grade_id
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
    ),`;
}

export function buildPaymentCtes(workspaceId: string): SQL {
  return sql`
    payment_activity_events as (
      select p.workspace_id, p.id as payment_id, p.recorded_at
      from payments p
      where p.workspace_id=${workspaceId}::uuid
      union all
      select p.workspace_id, p.id as payment_id, pr.recorded_at
      from payment_reversals pr
      join payments p on p.workspace_id=pr.workspace_id and p.id=pr.payment_id
      where pr.workspace_id=${workspaceId}::uuid
      union all
      select pa.workspace_id, pa.payment_id, pa.recorded_at
      from payment_allocations pa
      where pa.workspace_id=${workspaceId}::uuid
      union all
      select pa.workspace_id, pa.payment_id, par.recorded_at
      from payment_allocation_reversals par
      join payment_allocations pa on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
      where par.workspace_id=${workspaceId}::uuid
      union all
      select cp.workspace_id, cp.payment_id, cp.recorded_at
      from customer_payment_credit_preservations cp
      where cp.workspace_id=${workspaceId}::uuid
    ), payment_activity as (
      select p.workspace_id, p.id,
        greatest(p.recorded_at, coalesce(events.recorded_at, p.recorded_at)) as updated_at
      from payments p
      left join (
        select workspace_id, payment_id, max(recorded_at) as recorded_at
        from payment_activity_events
        group by workspace_id, payment_id
      ) events on events.workspace_id=p.workspace_id and events.payment_id=p.id
      where p.workspace_id=${workspaceId}::uuid and p.status <> 'reversed'
    ),`;
}

export function buildCandidateCtes(
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
  cursorClause: SQL,
  orderClause: SQL,
  limitClause: SQL,
): SQL {
  return sql`
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
    ),`;
}
