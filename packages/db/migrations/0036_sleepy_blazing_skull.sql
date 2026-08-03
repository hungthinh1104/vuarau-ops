CREATE TYPE "public"."cost_observation_case_kind" AS ENUM('normal', 'partial_or_exception', 'correction');--> statement-breakpoint
CREATE TYPE "public"."cost_observation_kind" AS ENUM('purchase_price', 'accepted_quantity', 'rejected_quantity', 'packing_material', 'labor_handling', 'transport', 'spoilage', 'damage', 'customer_return', 'supplier_claim', 'supplier_credit', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cost_observation.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'cost_observation';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'COST_OBSERVATION_ALREADY_RECORDED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "cost_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "cost_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"amount_minor" bigint,
	"amount_currency" "currency_code",
	"quantity_scaled" bigint,
	"quantity_unit" "unit",
	"product_id" uuid,
	"quality_grade_id" uuid,
	"source_reference" text,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cost_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cost_observations_amount_pair_ck" CHECK (("cost_observations"."amount_minor" is null and "cost_observations"."amount_currency" is null)
        or ("cost_observations"."amount_minor" is not null and "cost_observations"."amount_currency" is not null)),
	CONSTRAINT "cost_observations_quantity_pair_ck" CHECK (("cost_observations"."quantity_scaled" is null and "cost_observations"."quantity_unit" is null)
        or ("cost_observations"."quantity_scaled" is not null and "cost_observations"."quantity_unit" is not null)),
	CONSTRAINT "cost_observations_correction_link_ck" CHECK (("cost_observations"."case_kind" = 'correction' and "cost_observations"."related_observation_id" is not null)
        or ("cost_observations"."case_kind" <> 'correction' and "cost_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."cost_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cost_observations_workspace_time_idx" ON "cost_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "cost_observations_workspace_kind_idx" ON "cost_observations" USING btree ("workspace_id","kind","recorded_at","id");