import { sql } from "drizzle-orm";
import type {
  DeliveryId,
  FulfilmentRemainderOutcome,
  OperationsBoardInput,
} from "@vuarau/domain-contracts";
import type { CursorPosition } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import { deriveOperationsBoardExceptions } from "@vuarau/domain-kernel";
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
const asMoney = (amountMinor: number) => ({ amountMinor, currency: "VND" as const });
const nullableMoney = (row: Row, name: string) =>
  row[name] === null || row[name] === undefined ? null : asMoney(numberOf(row, name));
function mapBoardRows(rawRows: readonly Row[]) {
  return rawRows.map((row) => {
    const id = String(row["id"] ?? "");
    const kind = String(row["kind"] ?? "") as "sale" | "purchase" | "payment";
    const reference = String(row["reference"] ?? "");
    const amountMinor = numberOf(row, "amount");
    const commercialState = String(row["commercial_state"] ?? "");
    const physicalState = String(row["physical_state"] ?? "");
    const financialState = String(row["financial_state"] ?? "");
    const dueAt =
      row["due_at"] === null || row["due_at"] === undefined
        ? null
        : new Date(String(row["due_at"])).toISOString();
    const returnedFulfilment = Boolean(row["returned_fulfilment"]);
    const fulfilmentRemainderUnresolved = Boolean(row["fulfilment_remainder_unresolved"]);
    const fulfilmentRemainderOutcome =
      row["fulfilment_remainder_outcome"] === null ||
      row["fulfilment_remainder_outcome"] === undefined
        ? null
        : (String(row["fulfilment_remainder_outcome"]) as FulfilmentRemainderOutcome);
    const returnSettlementResolved = Boolean(row["return_settlement_resolved"]);
    const unallocatedPayment = Boolean(row["unallocated_payment"]);
    const reconciliationVariance = Boolean(row["reconciliation_variance"]);
    const unallocatedPaymentAmount = nullableMoney(row, "unallocated_payment_amount");
    const href = String(row["href"] ?? "");
    const deliveryId =
      row["delivery_id"] === null ? null : (String(row["delivery_id"]) as DeliveryId);
    return {
      id,
      kind,
      reference,
      counterparty: String(row["counterparty"] ?? ""),
      amount: asMoney(amountMinor),
      commercialState,
      physicalState,
      financialState,
      returnedFulfilment,
      fulfilmentRemainderOutcome,
      unallocatedPayment,
      unallocatedPaymentAmount,
      ageSeconds: numberOf(row, "age_seconds"),
      nextAction: row["next_action"] === null ? null : String(row["next_action"] ?? ""),
      exceptions: deriveOperationsBoardExceptions({
        id,
        kind,
        reference,
        href,
        amountMinor,
        dueAt,
        commercialState,
        physicalState,
        financialState,
        returnedFulfilment,
        unallocatedPayment,
        unallocatedPaymentAmountMinor: unallocatedPaymentAmount?.amountMinor ?? null,
        reconciliationVariance,
        fulfilmentRemainderUnresolved,
        fulfilmentRemainderOutcome,
        returnSettlementResolved,
        deliveryId,
      }),
      updatedAt: new Date(String(row["updated_at"])).toISOString(),
      href,
      deliveryId,
    };
  });
}
export async function queryFastOperationsBoardPage(
  tx: Tx,
  input: OperationsBoardInput & {
    page: { after: CursorPosition | null; limit: number };
    now: string;
  },
) {
  const after = input.page.after;
  const cursorClause =
    after === null
      ? sql`true`
      : sql`(updated_at < ${after.sortValue}::timestamptz or (updated_at = ${after.sortValue}::timestamptz and id < ${after.id}))`;
  const limitClause =
    input.page.limit === Number.MAX_SAFE_INTEGER ? sql`all` : sql`${input.page.limit + 1}`;
  const rows = await tx.execute(sql`
    with recursive
    payment_activity_events as (
      select payment_events.workspace_id, payment_events.payment_id, max(payment_events.recorded_at) as recorded_at
      from (
        select p.workspace_id, p.id as payment_id, p.recorded_at
        from payments p
        where p.workspace_id=${input.workspaceId}::uuid
        union all
        select p.workspace_id, p.id as payment_id, pr.recorded_at
        from payment_reversals pr
        join payments p
          on p.workspace_id=pr.workspace_id and p.id=pr.payment_id
        where pr.workspace_id=${input.workspaceId}::uuid
        union all
        select pa.workspace_id, pa.payment_id, pa.recorded_at
        from payment_allocations pa
        where pa.workspace_id=${input.workspaceId}::uuid
        union all
        select pa.workspace_id, pa.payment_id, par.recorded_at
        from payment_allocation_reversals par
        join payment_allocations pa
          on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
        where par.workspace_id=${input.workspaceId}::uuid
        union all
        select cp.workspace_id, cp.payment_id, cp.recorded_at
        from customer_payment_credit_preservations cp
        where cp.workspace_id=${input.workspaceId}::uuid
      ) payment_events
      group by payment_events.workspace_id, payment_events.payment_id
    ), payment_activity as (
      select p.workspace_id, p.id, greatest(p.recorded_at, coalesce(events.recorded_at, p.recorded_at)) as updated_at
      from payments p
      left join payment_activity_events events
        on events.workspace_id=p.workspace_id and events.payment_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status <> 'reversed'
    ), sale_activity_events as (
      select events.workspace_id, events.id, max(events.recorded_at) as recorded_at
      from (
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
        select d.workspace_id, d.sale_id as id, drs.recorded_at
        from delivery_return_settlements drs
        join delivery_returns dr
          on dr.workspace_id=drs.workspace_id and dr.id=drs.return_id
        join deliveries d
          on d.workspace_id=dr.workspace_id and d.id=dr.delivery_id
        where drs.workspace_id=${input.workspaceId}::uuid
        union all
        select frc.workspace_id, frc.sale_id as id, frc.recorded_at
        from fulfilment_remainder_cases frc
        where frc.workspace_id=${input.workspaceId}::uuid
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
      ) events
      group by events.workspace_id, events.id
    ), sale_activity as (
      select s.workspace_id, s.id,
        greatest(s.recorded_at, coalesce(s.posted_at, s.recorded_at), coalesce(events.recorded_at, s.recorded_at)) as updated_at
      from sales s
      left join sale_activity_events events
        on events.workspace_id=s.workspace_id and events.id=s.id
      where s.workspace_id=${input.workspaceId}::uuid and s.status='posted'
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
      select events.workspace_id, events.id, max(events.recorded_at) as recorded_at
      from (
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
      ) events
      group by events.workspace_id, events.id
    ), purchase_activity as (
      select p.workspace_id, p.id,
        greatest(p.recorded_at, coalesce(p.confirmed_at, p.recorded_at), coalesce(events.recorded_at, p.recorded_at)) as updated_at
      from purchases p
      left join purchase_activity_events events
        on events.workspace_id=p.workspace_id and events.id=p.id
      where p.workspace_id=${input.workspaceId}::uuid and p.status='confirmed'
    ), candidate_rows as (
      select sale_activity.id, 'sale' as kind, sale_activity.updated_at
      from sale_activity
      union all
      select purchase_activity.id, 'purchase' as kind, purchase_activity.updated_at
      from purchase_activity
      union all
      select payment_activity.id, 'payment' as kind, payment_activity.updated_at
      from payment_activity
      join payment_exposure_v1 payment_exposure
        on payment_exposure.workspace_id=payment_activity.workspace_id
        and payment_exposure.payment_id=payment_activity.id
        and payment_exposure.available_amount_minor > 0
    ), candidate_scope as materialized (
      select candidate_rows.*
      from candidate_rows
      where ${cursorClause}
      order by updated_at desc, id desc
      limit ${limitClause}
    ), candidate_sales as (
      select id from candidate_scope where kind='sale'
    ), candidate_purchases as (
      select id from candidate_scope where kind='purchase'
    ), candidate_payments as (
      select id from candidate_scope where kind='payment'
    ), delivered as (
      select sl.id as sale_line_id, sum(dl.quantity_scaled) as dispatched
      from delivery_lines dl
      join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      join sale_lines sl on sl.workspace_id=dl.workspace_id and sl.id=dl.sale_line_id
      join candidate_sales cs on cs.id=sl.sale_id
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      group by sl.id
    ), latest_delivery as (
      select distinct on (d.sale_id) d.sale_id, d.id as delivery_id
      from deliveries d
      join candidate_sales cs on cs.id=d.sale_id
      where d.workspace_id=${input.workspaceId}::uuid and d.status in ('dispatched','delivered')
      order by d.sale_id, d.transaction_time desc, d.recorded_at desc, d.id desc
    ), returned as (
      select sl.id as sale_line_id, sum(drl.quantity_scaled) as returned
      from delivery_return_lines drl
      join delivery_lines dl on dl.workspace_id=drl.workspace_id and dl.id=drl.delivery_line_id
      join sale_lines sl on sl.workspace_id=dl.workspace_id and sl.id=dl.sale_line_id
      join candidate_sales cs on cs.id=sl.sale_id
      join delivery_returns dr on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
      where dr.workspace_id=${input.workspaceId}::uuid
      group by sl.id
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
      join candidate_sales cs on cs.id=frc.sale_id
      where frc.workspace_id=${input.workspaceId}::uuid
      order by frc.sale_id, frc.transaction_time desc, frc.recorded_at desc, frc.id desc
    ), dispatched_remaining as (
      select sl.id as sale_line_id,
        sum(greatest(dl.quantity_scaled-coalesce(ret.returned,0),0)) as remaining
      from delivery_lines dl
      join sale_lines sl on sl.workspace_id=dl.workspace_id and sl.id=dl.sale_line_id
      join candidate_sales cs on cs.id=sl.sale_id
      join deliveries d on d.workspace_id=dl.workspace_id and d.id=dl.delivery_id
      left join (
        select drl.delivery_line_id, sum(drl.quantity_scaled) as returned
        from delivery_return_lines drl
        join delivery_returns dr on dr.workspace_id=drl.workspace_id and dr.id=drl.return_id
        where dr.workspace_id=${input.workspaceId}::uuid
        group by drl.delivery_line_id
      ) ret on ret.delivery_line_id=dl.id
      where dl.workspace_id=${input.workspaceId}::uuid and d.status='dispatched'
      group by sl.id
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
      from sales s
      join candidate_sales cs on cs.id=s.id
      join sale_lines sl on sl.workspace_id=s.workspace_id and sl.sale_id=s.id
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
      join payment_allocations pa on pa.workspace_id=par.workspace_id and pa.id=par.allocation_id
      join candidate_sales cs on cs.id=pa.sale_id
      where par.workspace_id=${input.workspaceId}::uuid
      group by par.workspace_id, par.allocation_id
    ), allocated as (
      select pa.sale_id,
        coalesce(sum(pa.amount_minor-coalesce(ar.amount,0)),0) as amount
      from payment_allocations pa
      join candidate_sales cs on cs.id=pa.sale_id
      left join allocation_reversals ar on ar.workspace_id=pa.workspace_id and ar.allocation_id=pa.id
      where pa.workspace_id=${input.workspaceId}::uuid
      group by pa.sale_id
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(case when prr.id is null then prl.quantity_scaled else 0 end),0) as received
      from purchase_receipt_lines prl
      join purchase_receipts pr on pr.workspace_id=prl.workspace_id and pr.id=prl.receipt_id
      join purchase_lines pl on pl.workspace_id=prl.workspace_id and pl.id=prl.purchase_line_id
      join candidate_purchases cp on cp.id=pl.purchase_id
      left join purchase_receipt_reversals prr on prr.workspace_id=pr.workspace_id and prr.receipt_id=pr.id
      where prl.workspace_id=${input.workspaceId}::uuid
      group by prl.workspace_id, prl.purchase_line_id
    ), disposition_roots as (
      select qd.workspace_id, qd.id as disposition_id, gal.purchase_line_id
      from quality_dispositions qd
      join goods_arrival_lines gal on gal.workspace_id=qd.workspace_id and gal.id=qd.source_arrival_line_id
      join purchase_lines pl on pl.workspace_id=gal.workspace_id and pl.id=gal.purchase_line_id
      join candidate_purchases cp on cp.id=pl.purchase_id
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
    ), purchase_received as (
      select pl.purchase_id, pl.id as line_id, pl.quantity_scaled,
        coalesce(direct.received,0)+coalesce(inspected.accepted,0) as received
      from purchase_lines pl
      join candidate_purchases cp on cp.id=pl.purchase_id
      left join direct_received direct on direct.workspace_id=pl.workspace_id and direct.purchase_line_id=pl.id
      left join inspected_accepted inspected on inspected.workspace_id=pl.workspace_id and inspected.purchase_line_id=pl.id
      where pl.workspace_id=${input.workspaceId}::uuid
    ), purchase_physical as (
      select p.id, case when bool_and(pr.received >= pr.quantity_scaled) then 'received' else 'needs_receiving' end as physical_state
      from purchases p
      join candidate_purchases cp on cp.id=p.id
      join purchase_received pr on pr.purchase_id=p.id
      where p.workspace_id=${input.workspaceId}::uuid
      group by p.id
    )
    select s.id, 'sale' as kind, ('SALE-' || upper(substr(s.id::text,1,8))) as reference,
      c.display_name as counterparty, s.total_amount_minor as amount, s.currency,
      case when sv.id is not null then 'voided' when sale_physical.physical_state='attention' then 'attention' else 'posted' end as commercial_state,
      sale_physical.physical_state,
      case
        when sv.id is not null then 'voided'
        when coalesce(allocated.amount,0) >= s.total_amount_minor then 'paid'
        when s.due_at is not null and s.due_at < ${input.now}::timestamptz then 'overdue'
        else 'awaiting_payment'
      end as financial_state,
      s.due_at as due_at,
      sale_physical.returned_fulfilment,
      sale_physical.return_settlement_resolved,
      sale_physical.fulfilment_remainder_unresolved,
      sale_physical.fulfilment_remainder_outcome::text as fulfilment_remainder_outcome,
      (sale_physical.physical_state='attention') as reconciliation_variance,
      false as unallocated_payment,
      null::bigint as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-s.recorded_at)) as age_seconds, cs.updated_at,
      case
        when sv.id is not null then null
        when sale_physical.physical_state='attention' then 'Kiểm tra'
        when sale_physical.returned_fulfilment and not sale_physical.return_settlement_resolved then 'Xử lý hàng trả'
        when sale_physical.fulfilment_remainder_unresolved then 'Mở Sale để quyết định phần còn lại.'
        when sale_physical.fulfilment_remainder_outcome='commercial_correction' then 'Mở Sale để điều chỉnh thương mại.'
        when sale_physical.physical_state='needs_delivery' then 'Giao hàng'
        when sale_physical.physical_state='in_delivery' then 'Theo dõi giao hàng'
        when coalesce(allocated.amount,0) < s.total_amount_minor then 'Thu tiền'
        else null
      end as next_action,
      sale_physical.delivery_id, ('/sales/' || s.id::text) as href
    from candidate_scope cs
    join sales s on s.workspace_id=${input.workspaceId}::uuid and s.id=cs.id and cs.kind='sale'
    join customers c on c.workspace_id=s.workspace_id and c.id=s.customer_id
    join sale_physical on sale_physical.id=s.id
    left join sale_voids sv on sv.workspace_id=s.workspace_id and sv.sale_id=s.id
    left join allocated on allocated.sale_id=s.id
    union all
    select p.id, 'purchase' as kind, ('PUR-' || upper(substr(p.id::text,1,8))) as reference,
      s.display_name as counterparty, p.total_amount_minor as amount, p.currency,
      case when pv.id is null then 'confirmed' else 'voided' end as commercial_state,
      purchase_physical.physical_state, case when pv.id is null then 'payable' else 'voided' end as financial_state,
      null::timestamptz as due_at,
      false as returned_fulfilment,
      false as return_settlement_resolved,
      false as fulfilment_remainder_unresolved,
      null::text as fulfilment_remainder_outcome,
      false as reconciliation_variance,
      false as unallocated_payment,
      null::bigint as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds, cs.updated_at,
      case when pv.id is not null then null when purchase_physical.physical_state='needs_receiving' then 'Nhận hàng' else null end as next_action,
      null::uuid as delivery_id, ('/purchases/' || p.id::text) as href
    from candidate_scope cs
    join purchases p on p.workspace_id=${input.workspaceId}::uuid and p.id=cs.id and cs.kind='purchase'
    join suppliers s on s.workspace_id=p.workspace_id and s.id=p.supplier_id
    join purchase_physical on purchase_physical.id=p.id
    left join purchase_voids pv on pv.workspace_id=p.workspace_id and pv.purchase_id=p.id
    union all
    select p.id, 'payment' as kind, ('PAY-' || upper(substr(p.id::text,1,8))) as reference,
      c.display_name as counterparty, payment_exposure.available_amount_minor as amount, p.currency,
      'not_applicable' as commercial_state, 'not_applicable' as physical_state,
      'unallocated' as financial_state, null::timestamptz as due_at,
      false as returned_fulfilment, false as return_settlement_resolved,
      false as fulfilment_remainder_unresolved, null::text as fulfilment_remainder_outcome,
      false as reconciliation_variance, true as unallocated_payment,
      payment_exposure.available_amount_minor as unallocated_payment_amount,
      extract(epoch from (${input.now}::timestamptz-p.recorded_at)) as age_seconds,
      pa.updated_at,
      'Mở khoản thanh toán để phân bổ hoặc ghi nhận tín dụng.' as next_action,
      null::uuid as delivery_id, ('/payments/' || p.id::text) as href
    from candidate_scope cs
    join candidate_payments cp on cp.id=cs.id
    join payments p on p.workspace_id=${input.workspaceId}::uuid and p.id=cs.id
    join payment_exposure_v1 payment_exposure
      on payment_exposure.workspace_id=p.workspace_id and payment_exposure.payment_id=p.id
    join payment_activity pa on pa.workspace_id=p.workspace_id and pa.id=p.id
    join customers c on c.workspace_id=p.workspace_id and c.id=p.customer_id
    order by updated_at desc, id desc
    limit ${limitClause}
  `);
  return {
    counts: {
      all: 0,
      outstandingDelivery: 0,
      incompleteReceiving: 0,
      needsReceiving: 0,
      needsDelivery: 0,
      inDelivery: 0,
      returnedFulfilment: 0,
      unallocatedPayment: 0,
      awaitingPayment: 0,
      overdue: 0,
      overdueReceivable: 0,
      attention: 0,
      fulfilmentRemainderUnresolved: 0,
      returnSettlementUnresolved: 0,
      reconciliationVariance: 0,
      exceptionCounts: {
        outstanding_delivery: 0,
        incomplete_receiving: 0,
        unallocated_payment: 0,
        overdue_receivable: 0,
        fulfilment_remainder_unresolved: 0,
        return_settlement_unresolved: 0,
        reconciliation_variance: 0,
      },
    },
    statusCounts: { commercial: [], physical: [], financial: [] },
    rows: mapBoardRows(rows as Row[]),
  };
}
