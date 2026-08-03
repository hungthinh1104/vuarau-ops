CREATE TYPE "public"."demand_observation_kind" AS ENUM('requested_order', 'expected_delivery', 'minimum_quantity', 'availability_note', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'demand_observation.recorded' BEFORE 'workspace_policy.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'demand_observation' BEFORE 'workspace_policy';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DEMAND_OBSERVATION_ALREADY_RECORDED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
CREATE TABLE "demand_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "demand_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"customer_id" uuid,
	"product_id" uuid,
	"quality_grade_id" uuid,
	"requested_quantity_scaled" bigint,
	"requested_quantity_unit" "unit",
	"minimum_quantity_scaled" bigint,
	"minimum_quantity_unit" "unit",
	"requested_for_at" timestamp with time zone,
	"counterparty_label" text,
	"demand_reference" text,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "demand_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "demand_observations_requested_quantity_pair_ck" CHECK (("demand_observations"."requested_quantity_scaled" is null and "demand_observations"."requested_quantity_unit" is null)
        or ("demand_observations"."requested_quantity_scaled" is not null and "demand_observations"."requested_quantity_unit" is not null)),
	CONSTRAINT "demand_observations_minimum_quantity_pair_ck" CHECK (("demand_observations"."minimum_quantity_scaled" is null and "demand_observations"."minimum_quantity_unit" is null)
        or ("demand_observations"."minimum_quantity_scaled" is not null and "demand_observations"."minimum_quantity_unit" is not null)),
	CONSTRAINT "demand_observations_correction_link_ck" CHECK (("demand_observations"."case_kind" = 'correction' and "demand_observations"."related_observation_id" is not null)
        or ("demand_observations"."case_kind" <> 'correction' and "demand_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."demand_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "demand_observations_workspace_time_idx" ON "demand_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "demand_observations_workspace_kind_idx" ON "demand_observations" USING btree ("workspace_id","kind","recorded_at","id");