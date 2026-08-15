CREATE VIEW "payment_exposure_v1" AS
WITH allocation_reversal_totals AS (
  SELECT
    par.workspace_id,
    par.allocation_id,
    COALESCE(SUM(par.amount_minor), 0) AS reversed_amount_minor
  FROM payment_allocation_reversals par
  GROUP BY par.workspace_id, par.allocation_id
), active_allocations AS (
  SELECT
    pa.workspace_id,
    pa.payment_id,
    COALESCE(
      SUM(GREATEST(pa.amount_minor - COALESCE(art.reversed_amount_minor, 0), 0)),
      0
    ) AS allocated_amount_minor
  FROM payment_allocations pa
  LEFT JOIN allocation_reversal_totals art
    ON art.workspace_id = pa.workspace_id
    AND art.allocation_id = pa.id
  GROUP BY pa.workspace_id, pa.payment_id
), active_preserved_credit AS (
  SELECT
    dc.workspace_id,
    dc.payment_reference AS payment_id,
    COALESCE(SUM(GREATEST(dc.amount_minor, 0)), 0) AS preserved_credit_amount_minor
  FROM debt_observations dc
  WHERE dc.kind = 'customer_credit_preserved'
    AND dc.payment_reference IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM debt_observations successor
      WHERE successor.workspace_id = dc.workspace_id
        AND successor.related_observation_id = dc.id
    )
  GROUP BY dc.workspace_id, dc.payment_reference
)
SELECT
  p.workspace_id,
  p.id AS payment_id,
  p.customer_id,
  p.currency,
  p.amount_minor AS original_amount_minor,
  p.reversed_amount_minor,
  GREATEST(p.amount_minor - p.reversed_amount_minor, 0) AS effective_amount_minor,
  COALESCE(aa.allocated_amount_minor, 0) AS allocated_amount_minor,
  COALESCE(apc.preserved_credit_amount_minor, 0) AS preserved_credit_amount_minor,
  GREATEST(
    GREATEST(p.amount_minor - p.reversed_amount_minor, 0)
      - COALESCE(aa.allocated_amount_minor, 0)
      - COALESCE(apc.preserved_credit_amount_minor, 0),
    0
  ) AS available_amount_minor
FROM payments p
LEFT JOIN active_allocations aa
  ON aa.workspace_id = p.workspace_id
  AND aa.payment_id = p.id
LEFT JOIN active_preserved_credit apc
  ON apc.workspace_id = p.workspace_id
  AND apc.payment_id = p.id::text;
