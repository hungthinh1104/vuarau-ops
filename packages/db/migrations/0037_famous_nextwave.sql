CREATE TYPE "public"."reconciliation_observation_kind" AS ENUM('cash_count', 'inventory_count', 'order_outstanding', 'delivery_outstanding', 'return_outstanding', 'claim_outstanding', 'packing_discrepancy', 'bank_statement_match', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'reconciliation_observation.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'reconciliation_observation';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECONCILIATION_OBSERVATION_ALREADY_RECORDED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "reconciliation_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "reconciliation_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"expected_amount_minor" bigint,
	"expected_amount_currency" "currency_code",
	"observed_amount_minor" bigint,
	"observed_amount_currency" "currency_code",
	"expected_quantity_scaled" bigint,
	"expected_quantity_unit" "unit",
	"observed_quantity_scaled" bigint,
	"observed_quantity_unit" "unit",
	"item_count" bigint,
	"product_id" uuid,
	"quality_grade_id" uuid,
	"scope_reference" text,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "reconciliation_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "reconciliation_observations_expected_amount_pair_ck" CHECK (("reconciliation_observations"."expected_amount_minor" is null and "reconciliation_observations"."expected_amount_currency" is null)
        or ("reconciliation_observations"."expected_amount_minor" is not null and "reconciliation_observations"."expected_amount_currency" is not null)),
	CONSTRAINT "reconciliation_observations_observed_amount_pair_ck" CHECK (("reconciliation_observations"."observed_amount_minor" is null and "reconciliation_observations"."observed_amount_currency" is null)
        or ("reconciliation_observations"."observed_amount_minor" is not null and "reconciliation_observations"."observed_amount_currency" is not null)),
	CONSTRAINT "reconciliation_observations_expected_quantity_pair_ck" CHECK (("reconciliation_observations"."expected_quantity_scaled" is null and "reconciliation_observations"."expected_quantity_unit" is null)
        or ("reconciliation_observations"."expected_quantity_scaled" is not null and "reconciliation_observations"."expected_quantity_unit" is not null)),
	CONSTRAINT "reconciliation_observations_observed_quantity_pair_ck" CHECK (("reconciliation_observations"."observed_quantity_scaled" is null and "reconciliation_observations"."observed_quantity_unit" is null)
        or ("reconciliation_observations"."observed_quantity_scaled" is not null and "reconciliation_observations"."observed_quantity_unit" is not null)),
	CONSTRAINT "reconciliation_observations_item_count_ck" CHECK ("reconciliation_observations"."item_count" is null or "reconciliation_observations"."item_count" >= 0),
	CONSTRAINT "reconciliation_observations_correction_link_ck" CHECK (("reconciliation_observations"."case_kind" = 'correction' and "reconciliation_observations"."related_observation_id" is not null)
        or ("reconciliation_observations"."case_kind" <> 'correction' and "reconciliation_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."reconciliation_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconciliation_observations_workspace_time_idx" ON "reconciliation_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "reconciliation_observations_workspace_kind_idx" ON "reconciliation_observations" USING btree ("workspace_id","kind","recorded_at","id");