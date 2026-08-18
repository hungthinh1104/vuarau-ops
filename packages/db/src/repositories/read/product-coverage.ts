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
  const rows = await tx.execute(sql`
    with on_hand as (
      select ib.product_id, ib.quality_grade_id, ib.unit, sum(ib.quantity_scaled) as quantity
      from ${inventoryBalances} ib
      where ib.workspace_id = ${workspaceId}::uuid and ib.product_id in (${ids})
      group by ib.product_id, ib.quality_grade_id, ib.unit
    ), inbound as (
      select facts.product_id, null::uuid as quality_grade_id, facts.unit,
        sum(facts.remaining_quantity_scaled) as quantity,
        bool_or(facts.integrity) as invalid
      from purchase_line_receiving_facts_v1 facts
      join ${purchases} purchase
        on purchase.workspace_id = facts.workspace_id and purchase.id = facts.purchase_id
      left join ${purchaseVoids} purchase_void
        on purchase_void.workspace_id = purchase.workspace_id
        and purchase_void.purchase_id = purchase.id
      where facts.workspace_id = ${workspaceId}::uuid
        and facts.product_id in (${ids})
        and purchase.status = 'confirmed' and purchase_void.id is null
      group by facts.product_id, facts.unit
    ), outbound as (
      select facts.product_id, sl.quality_grade_id, facts.unit,
        sum(facts.remaining_quantity_scaled) as quantity,
        bool_or(facts.integrity) as invalid
      from sale_line_fulfilment_facts_v1 facts
      join ${saleLines} sl
        on sl.workspace_id = facts.workspace_id and sl.id = facts.sale_line_id
      join ${sales} sale
        on sale.workspace_id = facts.workspace_id and sale.id = facts.sale_id
      left join ${saleVoids} sale_void
        on sale_void.workspace_id = sale.workspace_id and sale_void.sale_id = sale.id
      where facts.workspace_id = ${workspaceId}::uuid
        and facts.product_id in (${ids})
        and sale.status = 'posted' and sale_void.id is null
      group by facts.product_id, sl.quality_grade_id, facts.unit
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
