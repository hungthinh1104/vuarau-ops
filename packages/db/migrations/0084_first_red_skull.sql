ALTER TYPE "public"."audit_action" ADD VALUE 'payment.customer_credit_preserved' BEFORE 'debt.payment_allocated';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'customer_payment_credit_preservation' BEFORE 'debt';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_AMOUNT_INVALID' BEFORE 'CUSTOMER_CREDIT_PRESERVATION_EXCEEDS_UNALLOCATED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_ALREADY_RECORDED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_CORRECTION_LINK_INVALID' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_TARGET_ALREADY_CORRECTED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_CORRECTION_PAYMENT_MISMATCH' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_CREDIT_PRESERVATION_REQUIRES_FINANCIAL_COMMAND' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
CREATE TABLE "customer_payment_credit_preservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"case_kind" text NOT NULL,
	"related_preservation_id" uuid,
	"reason" text NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "customer_payment_credit_preservations_amount_positive_ck" CHECK ("customer_payment_credit_preservations"."amount_minor" > 0),
	CONSTRAINT "customer_payment_credit_preservations_case_link_ck" CHECK (("customer_payment_credit_preservations"."case_kind" = 'correction' and "customer_payment_credit_preservations"."related_preservation_id" is not null)
        or ("customer_payment_credit_preservations"."case_kind" = 'preservation' and "customer_payment_credit_preservations"."related_preservation_id" is null))
);
--> statement-breakpoint
-- Move only prior rows that were valid financial preservation facts. Invalid
-- historical Evidence remains readable in `debt_observations`, but was never a
-- canonical payment fact and must not enter the new financial table.
INSERT INTO "customer_payment_credit_preservations" (
  "id", "workspace_id", "payment_id", "customer_id", "amount_minor", "currency",
  "case_kind", "related_preservation_id", "reason", "evidence_references",
  "transaction_time", "recorded_at", "actor_id", "command_id"
)
SELECT
  dc.id,
  dc.workspace_id,
  p.id,
  p.customer_id,
  dc.amount_minor,
  dc.amount_currency,
  CASE WHEN dc.case_kind = 'correction' THEN 'correction' ELSE 'preservation' END,
  dc.related_observation_id,
  dc.description,
  dc.evidence_references,
  dc.transaction_time,
  dc.recorded_at,
  dc.actor_id,
  dc.command_id
FROM debt_observations dc
JOIN payments p
  ON p.workspace_id = dc.workspace_id
  AND p.id::text = dc.payment_reference
  AND p.customer_id = dc.customer_id
  AND p.currency = dc.amount_currency
WHERE dc.kind = 'customer_credit_preserved'
  AND dc.amount_minor > 0
  AND (
    dc.case_kind <> 'correction'
    OR EXISTS (
      SELECT 1
      FROM debt_observations target
      JOIN payments target_payment
        ON target_payment.workspace_id = target.workspace_id
        AND target_payment.id::text = target.payment_reference
        AND target_payment.customer_id = target.customer_id
        AND target_payment.currency = target.amount_currency
      WHERE target.workspace_id = dc.workspace_id
        AND target.id = dc.related_observation_id
        AND target.kind = 'customer_credit_preserved'
        AND target.amount_minor > 0
    )
  );
--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_id_uq" UNIQUE("workspace_id","id");--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_payment_customer_fk" FOREIGN KEY ("workspace_id","payment_id","customer_id") REFERENCES "public"."payments"("workspace_id","id","customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_preservation_id") REFERENCES "public"."customer_payment_credit_preservations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_payment_credit_preservations" ADD CONSTRAINT "customer_payment_credit_preservations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_payment_credit_preservations_payment_idx" ON "customer_payment_credit_preservations" USING btree ("workspace_id","payment_id","recorded_at","id");--> statement-breakpoint
DROP VIEW "payment_exposure_v1";--> statement-breakpoint
CREATE VIEW "payment_exposure_v1" AS
WITH allocation_reversal_totals AS (
  SELECT par.workspace_id, par.allocation_id, COALESCE(SUM(par.amount_minor), 0) AS reversed_amount_minor
  FROM payment_allocation_reversals par
  GROUP BY par.workspace_id, par.allocation_id
), active_allocations AS (
  SELECT
    pa.workspace_id,
    pa.payment_id,
    COALESCE(SUM(GREATEST(pa.amount_minor - COALESCE(art.reversed_amount_minor, 0), 0)), 0)
      AS allocated_amount_minor
  FROM payment_allocations pa
  LEFT JOIN allocation_reversal_totals art
    ON art.workspace_id = pa.workspace_id AND art.allocation_id = pa.id
  GROUP BY pa.workspace_id, pa.payment_id
), active_preserved_credit AS (
  SELECT
    cp.workspace_id,
    cp.payment_id,
    COALESCE(SUM(cp.amount_minor), 0) AS preserved_credit_amount_minor
  FROM customer_payment_credit_preservations cp
  WHERE NOT EXISTS (
    SELECT 1
    FROM customer_payment_credit_preservations successor
    WHERE successor.workspace_id = cp.workspace_id
      AND successor.related_preservation_id = cp.id
  )
  GROUP BY cp.workspace_id, cp.payment_id
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
  ON aa.workspace_id = p.workspace_id AND aa.payment_id = p.id
LEFT JOIN active_preserved_credit apc
  ON apc.workspace_id = p.workspace_id AND apc.payment_id = p.id;
