-- Keep the canonical fulfilment fact honest when a Delivery changes the Sale
-- line's quality identity. This is a view-definition correction only; the
-- append-only delivery ledger remains untouched.
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_SCOPE_IN_PROGRESS' BEFORE 'STOCKTAKE_VERSION_CONFLICT';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_PREVIEW_STALE' BEFORE 'STOCKTAKE_VERSION_CONFLICT';--> statement-breakpoint
CREATE UNIQUE INDEX "stocktake_sessions_workspace_scope_open_uq" ON "stocktake_sessions" USING btree ("workspace_id","scope_reference") WHERE status in ('draft', 'reopened');--> statement-breakpoint
CREATE OR REPLACE VIEW "sale_line_fulfilment_facts_v1" AS
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
      OR dl.quality_grade_id IS DISTINCT FROM sl.quality_grade_id
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
