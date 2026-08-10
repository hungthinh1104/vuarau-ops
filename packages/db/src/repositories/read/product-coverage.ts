import { sql } from "drizzle-orm";
import {
  UNITS,
  type ProductCoverageDto,
  type ProductCoverageQuantityDto,
  type ProductId,
  type Unit,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import {
  deliveries,
  deliveryLines,
  deliveryReturnLines,
  deliveryReturns,
  goodsArrivals,
  goodsArrivalLines,
  goodsArrivalReversals,
  inventoryBalances,
  products,
  purchases,
  purchaseLines,
  purchaseReceipts,
  purchaseReceiptLines,
  purchaseReceiptReversals,
  purchaseVoids,
  qualityDispositionAllocations,
  qualityDispositionReversals,
  qualityDispositions,
  saleLines,
  sales,
  saleVoids,
} from "../../schema/index.ts";
import { deriveProductCoverageQuantity } from "@vuarau/domain-kernel";
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
    with recursive disposition_roots as (
      select qd.workspace_id, qd.id as disposition_id,
        qd.source_arrival_line_id as root_arrival_line_id
      from ${qualityDispositions} qd
      left join ${qualityDispositionReversals} root_reversal
        on root_reversal.workspace_id = qd.workspace_id and root_reversal.disposition_id = qd.id
      where qd.workspace_id = ${workspaceId}::uuid
        and qd.source_type = 'arrival_line'
        and root_reversal.id is null
      union all
      select child.workspace_id, child.id, parent.root_arrival_line_id
      from ${qualityDispositions} child
      left join ${qualityDispositionReversals} child_reversal
        on child_reversal.workspace_id = child.workspace_id and child_reversal.disposition_id = child.id
      join ${qualityDispositionAllocations} source_allocation
        on source_allocation.workspace_id = child.workspace_id
        and source_allocation.id = child.source_quarantine_allocation_id
      join disposition_roots parent
        on parent.workspace_id = source_allocation.workspace_id
        and parent.disposition_id = source_allocation.disposition_id
      where child.workspace_id = ${workspaceId}::uuid
        and child.source_type = 'quarantine_allocation'
        and child_reversal.id is null
    ), on_hand as (
      select ib.product_id, ib.unit, sum(ib.quantity_scaled)::bigint as quantity
      from ${inventoryBalances} ib
      where ib.workspace_id = ${workspaceId}::uuid and ib.product_id in (${ids})
      group by ib.product_id, ib.unit
    ), legacy_received as (
      select prl.purchase_line_id, sum(prl.quantity_scaled)::bigint as quantity
      from ${purchaseReceiptLines} prl
      join ${purchaseReceipts} pr
        on pr.workspace_id = prl.workspace_id and pr.id = prl.receipt_id
      left join ${purchaseReceiptReversals} prr
        on prr.workspace_id = pr.workspace_id and prr.receipt_id = pr.id
      where prl.workspace_id = ${workspaceId}::uuid
        and prl.product_id in (${ids}) and prr.id is null
      group by prl.purchase_line_id
    ), accepted_received as (
      select root_line.purchase_line_id,
        sum(allocation.value_scaled)::bigint as quantity
      from ${qualityDispositionAllocations} allocation
      join ${qualityDispositions} disposition
        on disposition.workspace_id = allocation.workspace_id
        and disposition.id = allocation.disposition_id
      join disposition_roots root
        on root.workspace_id = disposition.workspace_id
        and root.disposition_id = disposition.id
      join ${goodsArrivalLines} root_line
        on root_line.workspace_id = root.workspace_id
        and root_line.id = root.root_arrival_line_id
      join ${goodsArrivals} root_arrival
        on root_arrival.workspace_id = root_line.workspace_id
        and root_arrival.id = root_line.arrival_id
      left join ${goodsArrivalReversals} root_arrival_reversal
        on root_arrival_reversal.workspace_id = root_arrival.workspace_id
        and root_arrival_reversal.arrival_id = root_arrival.id
      left join ${qualityDispositionReversals} reversal
        on reversal.workspace_id = disposition.workspace_id
        and reversal.disposition_id = disposition.id
      where allocation.workspace_id = ${workspaceId}::uuid
        and allocation.outcome = 'accepted'
        and root_line.product_id in (${ids})
        and root_line.purchase_line_id is not null
        and root_arrival_reversal.id is null
        and reversal.id is null
      group by root_line.purchase_line_id
    ), inbound as (
      select pl.product_id, pl.unit,
        sum(greatest(
          pl.quantity_scaled
            - coalesce(legacy_received.quantity, 0)
            - coalesce(accepted_received.quantity, 0),
          0
        ))::bigint as quantity
      from ${purchaseLines} pl
      join ${purchases} purchase
        on purchase.workspace_id = pl.workspace_id and purchase.id = pl.purchase_id
      left join ${purchaseVoids} purchase_void
        on purchase_void.workspace_id = purchase.workspace_id
        and purchase_void.purchase_id = purchase.id
      left join legacy_received on legacy_received.purchase_line_id = pl.id
      left join accepted_received on accepted_received.purchase_line_id = pl.id
      where pl.workspace_id = ${workspaceId}::uuid
        and pl.product_id in (${ids})
        and purchase.status = 'confirmed' and purchase_void.id is null
      group by pl.product_id, pl.unit
    ), dispatched as (
      select dl.sale_line_id, sum(dl.quantity_scaled)::bigint as quantity
      from ${deliveryLines} dl
      join ${deliveries} delivery
        on delivery.workspace_id = dl.workspace_id and delivery.id = dl.delivery_id
      where dl.workspace_id = ${workspaceId}::uuid
        and dl.product_id in (${ids})
        and delivery.status in ('dispatched', 'delivered')
      group by dl.sale_line_id
    ), returned as (
      select dl.sale_line_id, sum(return_line.quantity_scaled)::bigint as quantity
      from ${deliveryReturnLines} return_line
      join ${deliveryReturns} delivery_return on delivery_return.id = return_line.return_id
      join ${deliveryLines} dl on dl.id = return_line.delivery_line_id
      join ${deliveries} delivery
        on delivery.workspace_id = delivery_return.workspace_id
        and delivery.id = delivery_return.delivery_id
        and delivery.id = dl.delivery_id
      where delivery_return.workspace_id = ${workspaceId}::uuid
        and dl.product_id in (${ids})
      group by dl.sale_line_id
    ), outbound as (
      select sl.product_id, sl.unit,
        sum(greatest(
          sl.quantity_scaled
            - coalesce(dispatched.quantity, 0)
            + coalesce(returned.quantity, 0),
          0
        ))::bigint as quantity
      from ${saleLines} sl
      join ${sales} sale
        on sale.workspace_id = sl.workspace_id and sale.id = sl.sale_id
      left join ${saleVoids} sale_void
        on sale_void.workspace_id = sale.workspace_id and sale_void.sale_id = sale.id
      left join dispatched on dispatched.sale_line_id = sl.id
      left join returned on returned.sale_line_id = sl.id
      where sl.workspace_id = ${workspaceId}::uuid
        and sl.product_id in (${ids})
        and sale.status = 'posted' and sale_void.id is null
      group by sl.product_id, sl.unit
    ), coverage_units as (
      select product_id, unit from on_hand
      union select product_id, unit from inbound
      union select product_id, unit from outbound
      union select product.id as product_id, product.preferred_unit::unit as unit
        from ${products} product
        where product.workspace_id = ${workspaceId}::uuid
          and product.id in (${ids}) and product.preferred_unit is not null
    )
    select coverage_units.product_id as "productId", coverage_units.unit as "unit",
      coalesce(on_hand.quantity, 0)::bigint as "onHand",
      coalesce(inbound.quantity, 0)::bigint as "inboundRemaining",
      coalesce(outbound.quantity, 0)::bigint as "outboundRemaining"
    from coverage_units
    left join on_hand using (product_id, unit)
    left join inbound using (product_id, unit)
    left join outbound using (product_id, unit)
    order by coverage_units.product_id, coverage_units.unit
  `);
  const byProduct = new Map<string, ProductCoverageQuantityDto[]>(
    productIds.map((productId) => [productId, []]),
  );
  for (const raw of rows as unknown as Array<{
    productId: string;
    unit: Unit;
    onHand: number | string;
    inboundRemaining: number | string;
    outboundRemaining: number | string;
  }>) {
    const onHand = persistedBigintToSafeNumber(raw.onHand, "product coverage on-hand quantity");
    const inboundRemaining = persistedBigintToSafeNumber(
      raw.inboundRemaining,
      "product coverage inbound quantity",
    );
    const outboundRemaining = persistedBigintToSafeNumber(
      raw.outboundRemaining,
      "product coverage outbound quantity",
    );
    byProduct.get(raw.productId)?.push(
      deriveProductCoverageQuantity({
        unit: raw.unit,
        onHand,
        inboundRemaining,
        outboundRemaining,
      }),
    );
  }
  return productIds.map((productId) => ({
    workspaceId,
    productId,
    quantities: [...(byProduct.get(productId) ?? [])].sort(
      (left, right) => UNITS.indexOf(left.unit) - UNITS.indexOf(right.unit),
    ),
  }));
}
