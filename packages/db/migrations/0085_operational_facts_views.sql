CREATE VIEW "sale_line_fulfilment_facts_v1" AS
WITH returned AS (
  SELECT
    drl.workspace_id,
    drl.delivery_line_id,
    COALESCE(SUM(drl.quantity_scaled), 0) AS returned_quantity_scaled,
    COALESCE(
      BOOL_OR(drl.unit <> dl.unit OR dr.delivery_id <> dl.delivery_id),
      false
    ) AS invalid_return_unit
  FROM delivery_return_lines drl
  JOIN delivery_returns dr
    ON dr.workspace_id = drl.workspace_id AND dr.id = drl.return_id
  JOIN delivery_lines dl
    ON dl.workspace_id = drl.workspace_id AND dl.id = drl.delivery_line_id
  GROUP BY drl.workspace_id, drl.delivery_line_id
), active_lines AS (
  SELECT
    dl.workspace_id,
    sl.sale_id,
    dl.sale_line_id,
    dl.quantity_scaled AS dispatched_quantity_scaled,
    COALESCE(returned.returned_quantity_scaled, 0) AS returned_quantity_scaled,
    d.status AS delivery_status,
    (
      dl.unit <> sl.unit
      OR dl.product_id IS DISTINCT FROM sl.product_id
      OR COALESCE(returned.invalid_return_unit, false)
    ) AS invalid_unit
  FROM delivery_lines dl
  JOIN deliveries d
    ON d.workspace_id = dl.workspace_id AND d.id = dl.delivery_id
  JOIN sale_lines sl
    ON sl.workspace_id = dl.workspace_id AND sl.id = dl.sale_line_id
  LEFT JOIN returned
    ON returned.workspace_id = dl.workspace_id AND returned.delivery_line_id = dl.id
  WHERE d.status IN ('dispatched', 'delivered')
), delivery_facts AS (
  SELECT
    workspace_id,
    sale_id,
    sale_line_id,
    SUM(dispatched_quantity_scaled) AS dispatched_quantity_scaled,
    SUM(returned_quantity_scaled) AS returned_quantity_scaled,
    SUM(dispatched_quantity_scaled - returned_quantity_scaled) AS net_fulfilled_quantity_scaled,
    SUM(
      CASE
        WHEN delivery_status = 'dispatched'
          THEN GREATEST(dispatched_quantity_scaled - returned_quantity_scaled, 0)
        ELSE 0
      END
    ) AS active_dispatched_remaining_quantity_scaled,
    BOOL_OR(invalid_unit) AS invalid_unit
  FROM active_lines
  GROUP BY workspace_id, sale_id, sale_line_id
)
SELECT
  sl.workspace_id,
  sl.sale_id,
  sl.id AS sale_line_id,
  sl.product_id,
  sl.unit,
  sl.quantity_scaled AS ordered_quantity_scaled,
  COALESCE(delivery_facts.dispatched_quantity_scaled, 0) AS dispatched_quantity_scaled,
  COALESCE(delivery_facts.returned_quantity_scaled, 0) AS returned_quantity_scaled,
  COALESCE(delivery_facts.net_fulfilled_quantity_scaled, 0) AS net_fulfilled_quantity_scaled,
  COALESCE(delivery_facts.active_dispatched_remaining_quantity_scaled, 0)
    AS active_dispatched_remaining_quantity_scaled,
  GREATEST(
    sl.quantity_scaled - COALESCE(delivery_facts.net_fulfilled_quantity_scaled, 0),
    0
  ) AS remaining_quantity_scaled,
  (
    COALESCE(delivery_facts.invalid_unit, false)
    OR COALESCE(delivery_facts.net_fulfilled_quantity_scaled, 0) > sl.quantity_scaled
    OR COALESCE(delivery_facts.returned_quantity_scaled, 0)
      > COALESCE(delivery_facts.dispatched_quantity_scaled, 0)
  ) AS integrity
FROM sale_lines sl
LEFT JOIN delivery_facts
  ON delivery_facts.workspace_id = sl.workspace_id
  AND delivery_facts.sale_line_id = sl.id;
--> statement-breakpoint
CREATE VIEW "purchase_line_receiving_facts_v1" AS
WITH RECURSIVE direct_received AS (
  SELECT
    prl.workspace_id,
    prl.purchase_line_id,
    COALESCE(SUM(prl.quantity_scaled), 0) AS direct_received_net_quantity_scaled,
    COALESCE(
      BOOL_OR(prl.unit <> pl.unit OR prl.product_id IS DISTINCT FROM pl.product_id),
      false
    ) AS invalid_direct_unit
  FROM purchase_receipt_lines prl
  JOIN purchase_receipts pr
    ON pr.workspace_id = prl.workspace_id AND pr.id = prl.receipt_id
  JOIN purchase_lines pl
    ON pl.workspace_id = prl.workspace_id AND pl.id = prl.purchase_line_id
  LEFT JOIN purchase_receipt_reversals prr
    ON prr.workspace_id = pr.workspace_id AND prr.receipt_id = pr.id
  WHERE prr.id IS NULL
  GROUP BY prl.workspace_id, prl.purchase_line_id
), disposition_roots(workspace_id, disposition_id, purchase_line_id, product_id, unit) AS (
  SELECT
    qd.workspace_id,
    qd.id,
    gal.purchase_line_id,
    gal.product_id,
    gal.arrived_unit
  FROM quality_dispositions qd
  JOIN goods_arrival_lines gal
    ON gal.workspace_id = qd.workspace_id AND gal.id = qd.source_arrival_line_id
  JOIN goods_arrivals ga
    ON ga.workspace_id = gal.workspace_id AND ga.id = gal.arrival_id
  LEFT JOIN goods_arrival_reversals gar
    ON gar.workspace_id = ga.workspace_id AND gar.arrival_id = ga.id
  LEFT JOIN quality_disposition_reversals qdr
    ON qdr.workspace_id = qd.workspace_id AND qdr.disposition_id = qd.id
  WHERE qd.source_type = 'arrival_line'
    AND gal.purchase_line_id IS NOT NULL
    AND gar.id IS NULL
    AND qdr.id IS NULL
  UNION ALL
  SELECT
    child.workspace_id,
    child.id,
    parent.purchase_line_id,
    parent.product_id,
    parent.unit
  FROM quality_dispositions child
  JOIN quality_disposition_allocations source_allocation
    ON source_allocation.workspace_id = child.workspace_id
    AND source_allocation.id = child.source_quarantine_allocation_id
    AND source_allocation.outcome = 'quarantined'
  JOIN disposition_roots parent
    ON parent.workspace_id = source_allocation.workspace_id
    AND parent.disposition_id = source_allocation.disposition_id
  LEFT JOIN quality_disposition_reversals child_reversal
    ON child_reversal.workspace_id = child.workspace_id
    AND child_reversal.disposition_id = child.id
  WHERE child.source_type = 'quarantine_allocation'
    AND child_reversal.id IS NULL
), inspected_accepted AS (
  SELECT
    qda.workspace_id,
    roots.purchase_line_id,
    COALESCE(SUM(qda.value_scaled), 0) AS inspected_accepted_net_quantity_scaled,
    COALESCE(
      BOOL_OR(
        qda.unit <> pl.unit
        OR roots.product_id IS DISTINCT FROM pl.product_id
        OR roots.unit IS DISTINCT FROM pl.unit
      ),
      false
    ) AS invalid_inspected_unit
  FROM quality_disposition_allocations qda
  JOIN disposition_roots roots
    ON roots.workspace_id = qda.workspace_id AND roots.disposition_id = qda.disposition_id
  JOIN purchase_lines pl
    ON pl.workspace_id = roots.workspace_id AND pl.id = roots.purchase_line_id
  LEFT JOIN quality_disposition_reversals qdr
    ON qdr.workspace_id = qda.workspace_id AND qdr.disposition_id = qda.disposition_id
  WHERE qda.outcome = 'accepted' AND qdr.id IS NULL
  GROUP BY qda.workspace_id, roots.purchase_line_id
)
SELECT
  pl.workspace_id,
  pl.purchase_id,
  pl.id AS purchase_line_id,
  pl.product_id,
  pl.unit,
  pl.quantity_scaled AS ordered_quantity_scaled,
  COALESCE(direct_received.direct_received_net_quantity_scaled, 0)
    AS direct_received_net_quantity_scaled,
  COALESCE(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
    AS inspected_accepted_net_quantity_scaled,
  COALESCE(direct_received.direct_received_net_quantity_scaled, 0)
    + COALESCE(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
    AS received_net_quantity_scaled,
  GREATEST(
    pl.quantity_scaled
      - COALESCE(direct_received.direct_received_net_quantity_scaled, 0)
      - COALESCE(inspected_accepted.inspected_accepted_net_quantity_scaled, 0),
    0
  ) AS remaining_quantity_scaled,
  (
    COALESCE(direct_received.invalid_direct_unit, false)
    OR COALESCE(inspected_accepted.invalid_inspected_unit, false)
    OR COALESCE(direct_received.direct_received_net_quantity_scaled, 0)
      + COALESCE(inspected_accepted.inspected_accepted_net_quantity_scaled, 0)
      > pl.quantity_scaled
  ) AS integrity
FROM purchase_lines pl
LEFT JOIN direct_received
  ON direct_received.workspace_id = pl.workspace_id
  AND direct_received.purchase_line_id = pl.id
LEFT JOIN inspected_accepted
  ON inspected_accepted.workspace_id = pl.workspace_id
  AND inspected_accepted.purchase_line_id = pl.id;
