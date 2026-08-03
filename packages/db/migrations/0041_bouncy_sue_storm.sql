CREATE TYPE "public"."supplier_observation_kind" AS ENUM('role', 'product_supplied', 'source_area', 'pickup_responsibility', 'packing_responsibility', 'transport_responsibility', 'expected_lead_time', 'payment_arrangement', 'traceability_level', 'promised_quantity', 'actual_quantity', 'expected_arrival', 'actual_arrival', 'accepted_quantity', 'rejected_quantity', 'claim', 'price', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier_observation.recorded' BEFORE 'workspace_policy.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supplier_observation' BEFORE 'workspace_policy';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_CORRECTION_TARGET_REQUIRED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_CORRECTION_TARGET_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_CORRECTION_LINK_INVALID' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_NOT_FOUND' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_OBSERVATION_ALREADY_RECORDED' BEFORE 'WORKSPACE_POLICY_ALREADY_EXISTS';--> statement-breakpoint
CREATE TABLE "supplier_observations" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" "supplier_observation_kind" NOT NULL,
	"case_kind" "cost_observation_case_kind" NOT NULL,
	"description" text NOT NULL,
	"participant_wording" text NOT NULL,
	"supplier_id" uuid,
	"product_id" uuid,
	"quality_grade_id" uuid,
	"role" text,
	"source_area" text,
	"pickup_responsibility" text,
	"packing_responsibility" text,
	"transport_responsibility" text,
	"expected_lead_time_text" text,
	"payment_arrangement" text,
	"traceability_level" text,
	"promised_quantity_scaled" bigint,
	"promised_quantity_unit" "unit",
	"actual_quantity_scaled" bigint,
	"actual_quantity_unit" "unit",
	"accepted_quantity_scaled" bigint,
	"accepted_quantity_unit" "unit",
	"rejected_quantity_scaled" bigint,
	"rejected_quantity_unit" "unit",
	"expected_at" timestamp with time zone,
	"actual_at" timestamp with time zone,
	"price_minor" bigint,
	"price_currency" "currency_code",
	"claim_reference" text,
	"observation_reference" text,
	"evidence_references" text[] NOT NULL,
	"related_observation_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "supplier_observations_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "supplier_observations_promised_quantity_pair_ck" CHECK (("supplier_observations"."promised_quantity_scaled" is null and "supplier_observations"."promised_quantity_unit" is null)
        or ("supplier_observations"."promised_quantity_scaled" is not null and "supplier_observations"."promised_quantity_unit" is not null)),
	CONSTRAINT "supplier_observations_actual_quantity_pair_ck" CHECK (("supplier_observations"."actual_quantity_scaled" is null and "supplier_observations"."actual_quantity_unit" is null)
        or ("supplier_observations"."actual_quantity_scaled" is not null and "supplier_observations"."actual_quantity_unit" is not null)),
	CONSTRAINT "supplier_observations_accepted_quantity_pair_ck" CHECK (("supplier_observations"."accepted_quantity_scaled" is null and "supplier_observations"."accepted_quantity_unit" is null)
        or ("supplier_observations"."accepted_quantity_scaled" is not null and "supplier_observations"."accepted_quantity_unit" is not null)),
	CONSTRAINT "supplier_observations_rejected_quantity_pair_ck" CHECK (("supplier_observations"."rejected_quantity_scaled" is null and "supplier_observations"."rejected_quantity_unit" is null)
        or ("supplier_observations"."rejected_quantity_scaled" is not null and "supplier_observations"."rejected_quantity_unit" is not null)),
	CONSTRAINT "supplier_observations_price_pair_ck" CHECK (("supplier_observations"."price_minor" is null and "supplier_observations"."price_currency" is null)
        or ("supplier_observations"."price_minor" is not null and "supplier_observations"."price_currency" is not null)),
	CONSTRAINT "supplier_observations_correction_link_ck" CHECK (("supplier_observations"."case_kind" = 'correction' and "supplier_observations"."related_observation_id" is not null)
        or ("supplier_observations"."case_kind" <> 'correction' and "supplier_observations"."related_observation_id" is null))
);
--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_supplier_fk" FOREIGN KEY ("workspace_id","supplier_id") REFERENCES "public"."suppliers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_related_fk" FOREIGN KEY ("workspace_id","related_observation_id") REFERENCES "public"."supplier_observations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_observations_workspace_time_idx" ON "supplier_observations" USING btree ("workspace_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "supplier_observations_workspace_kind_idx" ON "supplier_observations" USING btree ("workspace_id","kind","recorded_at","id");