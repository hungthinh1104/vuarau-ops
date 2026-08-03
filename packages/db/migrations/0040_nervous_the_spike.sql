CREATE TYPE "public"."supply_commitment_observation_kind" AS ENUM('promised_supply', 'expected_arrival', 'minimum_order', 'availability_note', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supply_commitment_observation.recorded' BEFORE 'workspace_policy.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supply_commitment_observation' BEFORE 'workspace_policy';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_OBSERVATION_ALREADY_RECORDED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
CREATE TABLE "supply_commitment_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "supply_commitment_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"supplier_id" uuid,
	"product_id" uuid,
	"quality_grade_id" uuid,
	"promised_quantity_scaled" bigint,
	"promised_quantity_unit" "unit",
	"minimum_order_scaled" bigint,
	"minimum_order_unit" "unit",
	"expected_arrival_at" timestamp with time zone,
	"counterparty_label" text,
	"commitment_reference" text,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "supply_commitment_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "supply_commitment_observations_promised_quantity_pair_ck" CHECK (("supply_commitment_observations"."promised_quantity_scaled" is null and "supply_commitment_observations"."promised_quantity_unit" is null)
        or ("supply_commitment_observations"."promised_quantity_scaled" is not null and "supply_commitment_observations"."promised_quantity_unit" is not null)),
	CONSTRAINT "supply_commitment_observations_minimum_order_pair_ck" CHECK (("supply_commitment_observations"."minimum_order_scaled" is null and "supply_commitment_observations"."minimum_order_unit" is null)
        or ("supply_commitment_observations"."minimum_order_scaled" is not null and "supply_commitment_observations"."minimum_order_unit" is not null)),
	CONSTRAINT "supply_commitment_observations_correction_link_ck" CHECK (("supply_commitment_observations"."case_kind" = 'correction' and "supply_commitment_observations"."related_observation_id" is not null)
        or ("supply_commitment_observations"."case_kind" <> 'correction' and "supply_commitment_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_supplier_fk" FOREIGN KEY ("workspace_id","supplier_id") REFERENCES "public"."suppliers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."supply_commitment_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supply_commitment_observations_workspace_time_idx" ON "supply_commitment_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "supply_commitment_observations_workspace_kind_idx" ON "supply_commitment_observations" USING btree ("workspace_id","kind","recorded_at","id");