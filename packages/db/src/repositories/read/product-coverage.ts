import { sql } from "drizzle-orm";
import {
  UNITS,
  type ProductCoverageDto,
  type ProductCoverageQuantityDto,
  type ProductId,
  type QualityGradeId,
  type Unit,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  inventoryBalances,
  products,
  purchases,
  purchaseVoids,
  qualityGrades,
  saleLines,
  sales,
  saleVoids,
} from "../../schema/index.ts";
import { deriveProductCoverageQuantity } from "@vuarau/domain-kernel";
import { PersistedIntegrityError, PersistedNumberOutOfRangeError } from "../../errors.ts";
import { persistedBigintToSafeNumber } from "../../schema/safe-bigint.ts";
import type { Tx } from "../shared/types.ts";

export async function readProductCoverage(
  tx: Tx,
  workspaceId: WorkspaceId,
  productIds: readonly ProductId[],
): Promise<readonly ProductCoverageDto[]> {
  if (productIds.length === 0) return [];
  const ids = sql.join(
    productIds.map((productId) => sql`${productId}::uuid`),
    sql`, `,
  );
  // Keep the product predicate at the source CTEs. The canonical facts views
  // are intentionally workspace-wide; applying the product filter only after
  // those aggregates turns a one-product read into a full-ledger scan.
  // The CTE formulas mirror the canonical view semantics, including reversals
  // and quality-disposition lineage.
  const rows = await tx.execute(sql`
    with recursive sale_line_scope as (
      select sl.workspace_id, sl.id, sl.sale_id, sl.product_id, sl.quality_grade_id, sl.unit,
        sl.quantity_scaled
      from ${saleLines} sl
      where sl.workspace_id = ${workspaceId}::uuid and sl.product_id in (${ids})
    ), returned as (
      select drl.workspace_id, drl.delivery_line_id,
        coalesce(sum(drl.quantity_scaled), 0) as returned_quantity_scaled,
        coalesce(bool_or(drl.unit <> dl.unit or dr.delivery_id <> dl.delivery_id), false)
          as invalid_return_unit
      from delivery_return_lines drl
      join delivery_returns dr
        on dr.workspace_id = drl.workspace_id and dr.id = drl.return_id
      join delivery_lines dl
        on dl.workspace_id = drl.workspace_id and dl.id = drl.delivery_line_id
      join sale_line_scope scoped_sl
        on scoped_sl.workspace_id = dl.workspace_id and scoped_sl.id = dl.sale_line_id
      group by drl.workspace_id, drl.delivery_line_id
    ), delivery_facts as (
      select dl.workspace_id, scoped_sl.id as sale_line_id,
        sum(dl.quantity_scaled) as dispatched_quantity_scaled,
        sum(coalesce(returned.returned_quantity_scaled, 0)) as returned_quantity_scaled,
        sum(dl.quantity_scaled - coalesce(returned.returned_quantity_scaled, 0))
          as net_fulfilled_quantity_scaled,
        bool_or(
          dl.unit <> scoped_sl.unit
          or dl.product_id is distinct from scoped_sl.product_id
          or coalesce(returned.invalid_return_unit, false)
        ) as invalid_unit
      from delivery_lines dl
      join deliveries d
        on d.workspace_id = dl.workspace_id and d.id = dl.delivery_id
      join sale_line_scope scoped_sl
        on scoped_sl.workspace_id = dl.workspace_id and scoped_sl.id = dl.sale_line_id
      left join returned
        on returned.workspace_id = dl.workspace_id and returned.delivery_line_id = dl.id
      where d.status in ('dispatched', 'delivered')
      group by dl.workspace_id, scoped_sl.id
    ), outbound as (
      select scoped_sl.product_id, scoped_sl.quality_grade_id, scoped_sl.unit,
        sum(greatest(
          scoped_sl.quantity_scaled - coalesce(delivery_facts.net_fulfilled_quantity_scaled, 0),
          0
        )) as quantity,
        coalesce(bool_or(
          coalesce(delivery_facts.invalid_unit, false)
          or coalesce(delivery_facts.net_fulfilled_quantity_scaled, 0)
            > scoped_sl.quantity_scaled
          or coalesce(delivery_facts.returned_quantity_scaled, 0)
            > coalesce(delivery_facts.dispatched_quantity_scaled, 0)
        ), false) as invalid
      from sale_line_scope scoped_sl
      join ${sales} sale
        on sale.workspace_id = scoped_sl.workspace_id and sale.id = scoped_sl.sale_id
      left join ${saleVoids} sale_void
        on sale_void.workspace_id = sale.workspace_id and sale_void.sale_id = sale.id
      left join delivery_facts
        on delivery_facts.workspace_id = scoped_sl.workspace_id
        and delivery_facts.sale_line_id = scoped_sl.id
      where sale.status = 'posted' and sale_void.id is null
      group by scoped_sl.product_id, scoped_sl.quality_grade_id, scoped_sl.unit
    ), purchase_line_scope as (
      select pl.workspace_id, pl.id, pl.purchase_id, pl.product_id, pl.unit,
        pl.quantity_scaled
      from purchase_lines pl
      where pl.workspace_id = ${workspaceId}::uuid and pl.product_id in (${ids})
    ), direct_received as (
      select prl.workspace_id, prl.purchase_line_id,
        coalesce(sum(prl.quantity_scaled), 0) as quantity,
        coalesce(bool_or(
          prl.unit <> scoped_pl.unit or prl.product_id is distinct from scoped_pl.product_id
        ), false) as invalid
      from purchase_receipt_lines prl
      join purchase_receipts pr
        on pr.workspace_id = prl.workspace_id and pr.id = prl.receipt_id
      join purchase_line_scope scoped_pl
        on scoped_pl.workspace_id = prl.workspace_id and scoped_pl.id = prl.purchase_line_id
      left join purchase_receipt_reversals prr
        on prr.workspace_id = pr.workspace_id and prr.receipt_id = pr.id
      where prr.id is null
      group by prl.workspace_id, prl.purchase_line_id
    ), disposition_roots(workspace_id, disposition_id, purchase_line_id, product_id, unit) as (
      select qd.workspace_id, qd.id, gal.purchase_line_id, gal.product_id, gal.arrived_unit
      from quality_dispositions qd
      join goods_arrival_lines gal
        on gal.workspace_id = qd.workspace_id and gal.id = qd.source_arrival_line_id
      join purchase_line_scope scoped_pl
        on scoped_pl.workspace_id = gal.workspace_id and scoped_pl.id = gal.purchase_line_id
      join goods_arrivals ga
        on ga.workspace_id = gal.workspace_id and ga.id = gal.arrival_id
      left join goods_arrival_reversals gar
        on gar.workspace_id = ga.workspace_id and gar.arrival_id = ga.id
      left join quality_disposition_reversals qdr
        on qdr.workspace_id = qd.workspace_id and qdr.disposition_id = qd.id
      where qd.source_type = 'arrival_line'
        and gal.purchase_line_id is not null
        and gar.id is null and qdr.id is null
      union all
      select child.workspace_id, child.id, parent.purchase_line_id, parent.product_id, parent.unit
      from quality_dispositions child
      join quality_disposition_allocations source_allocation
        on source_allocation.workspace_id = child.workspace_id
        and source_allocation.id = child.source_quarantine_allocation_id
        and source_allocation.outcome = 'quarantined'
      join disposition_roots parent
        on parent.workspace_id = source_allocation.workspace_id
        and parent.disposition_id = source_allocation.disposition_id
      left join quality_disposition_reversals child_reversal
        on child_reversal.workspace_id = child.workspace_id
        and child_reversal.disposition_id = child.id
      where child.source_type = 'quarantine_allocation' and child_reversal.id is null
    ), inspected_accepted as (
      select qda.workspace_id, roots.purchase_line_id,
        coalesce(sum(qda.value_scaled), 0) as quantity,
        coalesce(bool_or(
          qda.unit <> scoped_pl.unit
          or roots.product_id is distinct from scoped_pl.product_id
          or roots.unit is distinct from scoped_pl.unit
        ), false) as invalid
      from quality_disposition_allocations qda
      join disposition_roots roots
        on roots.workspace_id = qda.workspace_id and roots.disposition_id = qda.disposition_id
      join purchase_line_scope scoped_pl
        on scoped_pl.workspace_id = roots.workspace_id and scoped_pl.id = roots.purchase_line_id
      left join quality_disposition_reversals qdr
        on qdr.workspace_id = qda.workspace_id and qdr.disposition_id = qda.disposition_id
      where qda.outcome = 'accepted' and qdr.id is null
      group by qda.workspace_id, roots.purchase_line_id
    ), inbound as (
      select scoped_pl.product_id, null::uuid as quality_grade_id, scoped_pl.unit,
        sum(greatest(
          scoped_pl.quantity_scaled
          - coalesce(direct_received.quantity, 0)
          - coalesce(inspected_accepted.quantity, 0),
          0
        )) as quantity,
        coalesce(bool_or(
          coalesce(direct_received.invalid, false)
          or coalesce(inspected_accepted.invalid, false)
          or coalesce(direct_received.quantity, 0) + coalesce(inspected_accepted.quantity, 0)
            > scoped_pl.quantity_scaled
        ), false) as invalid
      from purchase_line_scope scoped_pl
      join ${purchases} purchase
        on purchase.workspace_id = scoped_pl.workspace_id and purchase.id = scoped_pl.purchase_id
      left join ${purchaseVoids} purchase_void
        on purchase_void.workspace_id = purchase.workspace_id
        and purchase_void.purchase_id = purchase.id
      left join direct_received
        on direct_received.workspace_id = scoped_pl.workspace_id
        and direct_received.purchase_line_id = scoped_pl.id
      left join inspected_accepted
        on inspected_accepted.workspace_id = scoped_pl.workspace_id
        and inspected_accepted.purchase_line_id = scoped_pl.id
      where purchase.status = 'confirmed' and purchase_void.id is null
      group by scoped_pl.product_id, scoped_pl.unit
    ), on_hand as (
      select ib.product_id, ib.quality_grade_id, ib.unit, sum(ib.quantity_scaled) as quantity
      from ${inventoryBalances} ib
      where ib.workspace_id = ${workspaceId}::uuid and ib.product_id in (${ids})
      group by ib.product_id, ib.quality_grade_id, ib.unit
    ), coverage_units as (
      select product_id, quality_grade_id, unit from on_hand
      union select product_id, quality_grade_id, unit from inbound
      union select product_id, quality_grade_id, unit from outbound
      union select product.id as product_id, null::uuid as quality_grade_id,
        product.preferred_unit::unit as unit
        from ${products} product
        where product.workspace_id = ${workspaceId}::uuid
          and product.id in (${ids}) and product.preferred_unit is not null
    )
    select coverage_units.product_id as "productId",
      coverage_units.quality_grade_id as "qualityGradeId",
      grade.name as "qualityGradeName",
      coverage_units.unit as "unit",
      coalesce(on_hand.quantity, 0) as "onHand",
      coalesce(inbound.quantity, 0) as "inboundRemaining",
      coalesce(outbound.quantity, 0) as "outboundRemaining",
      coalesce(inbound.invalid, false) or coalesce(outbound.invalid, false) as "invalid"
    from coverage_units
    left join ${qualityGrades} grade
      on grade.workspace_id = ${workspaceId}::uuid
      and grade.id = coverage_units.quality_grade_id
    left join on_hand
      on on_hand.product_id = coverage_units.product_id
      and on_hand.quality_grade_id is not distinct from coverage_units.quality_grade_id
      and on_hand.unit = coverage_units.unit
    left join inbound
      on inbound.product_id = coverage_units.product_id
      and inbound.quality_grade_id is not distinct from coverage_units.quality_grade_id
      and inbound.unit = coverage_units.unit
    left join outbound
      on outbound.product_id = coverage_units.product_id
      and outbound.quality_grade_id is not distinct from coverage_units.quality_grade_id
      and outbound.unit = coverage_units.unit
    order by coverage_units.product_id, coverage_units.unit, coverage_units.quality_grade_id nulls first
  `);
  const byProduct = new Map<string, ProductCoverageQuantityDto[]>(
    productIds.map((productId) => [productId, []]),
  );
  for (const raw of rows as unknown as Array<{
    productId: string;
    qualityGradeId: string | null;
    qualityGradeName: string | null;
    unit: Unit;
    onHand: number | string;
    inboundRemaining: number | string;
    outboundRemaining: number | string;
    invalid: boolean;
  }>) {
    if (raw.invalid) {
      throw new PersistedIntegrityError(
        "Product coverage contains an over-received or over-fulfilled source line.",
      );
    }
    const onHand = persistedBigintToSafeNumber(raw.onHand, "product coverage on-hand quantity");
    const inboundRemaining = persistedBigintToSafeNumber(
      raw.inboundRemaining,
      "product coverage inbound quantity",
    );
    const outboundRemaining = persistedBigintToSafeNumber(
      raw.outboundRemaining,
      "product coverage outbound quantity",
    );
    try {
      byProduct.get(raw.productId)?.push(
        deriveProductCoverageQuantity({
          unit: raw.unit,
          qualityGradeId: raw.qualityGradeId as QualityGradeId | null,
          qualityGradeName: raw.qualityGradeName,
          onHand,
          inboundRemaining,
          outboundRemaining,
        }),
      );
    } catch (error) {
      if (error instanceof RangeError) {
        throw new PersistedNumberOutOfRangeError("product_coverage.available_after_commitments");
      }
      throw error;
    }
  }
  return productIds.map((productId) => ({
    workspaceId,
    productId,
    quantities: [...(byProduct.get(productId) ?? [])].sort((left, right) => {
      const unitOrder = UNITS.indexOf(left.unit) - UNITS.indexOf(right.unit);
      if (unitOrder !== 0) return unitOrder;
      if (left.qualityGradeId === null) return -1;
      if (right.qualityGradeId === null) return 1;
      return left.qualityGradeId.localeCompare(right.qualityGradeId);
    }),
  }));
}
