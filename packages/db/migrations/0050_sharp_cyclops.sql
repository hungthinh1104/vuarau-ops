CREATE TYPE "public"."stocktake_state" AS ENUM('draft', 'approved', 'reopened');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'stocktake_variance';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'stocktake.started' BEFORE 'delivery.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'stocktake.count_recorded' BEFORE 'delivery.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'stocktake.approved' BEFORE 'delivery.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'stocktake.reopened' BEFORE 'delivery.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'stocktake' BEFORE 'delivery';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCK_PLANNING_POLICY_UNAVAILABLE' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_POLICY_UNAVAILABLE' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_NOT_FOUND' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_ALREADY_EXISTS' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_VERSION_CONFLICT' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_STATE_INVALID' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_COUNT_INVALID' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_COUNT_DUPLICATE' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_VARIANCE_ALREADY_APPLIED' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'STOCKTAKE_LINEAGE_MISSING' BEFORE 'PAYMENT_AMOUNT_INVALID';--> statement-breakpoint
CREATE TABLE "stocktake_counts" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quality_grade_id" uuid,
	"quality_grade_name" text,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"supersedes_count_id" uuid,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "stocktake_counts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "stocktake_counts_quantity_ck" CHECK ("stocktake_counts"."quantity_scaled" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stocktake_sessions" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"as_of" timestamp with time zone NOT NULL,
	"scope_reference" text NOT NULL,
	"note" text,
	"status" "stocktake_state" DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"policy_version_id" uuid NOT NULL,
	"variance_movement_ids" uuid[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "stocktake_sessions_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "stocktake_sessions_version_ck" CHECK ("stocktake_sessions"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_workspace_session_fk" FOREIGN KEY ("workspace_id","session_id") REFERENCES "public"."stocktake_sessions"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_workspace_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_workspace_supersedes_fk" FOREIGN KEY ("workspace_id","supersedes_count_id") REFERENCES "public"."stocktake_counts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_workspace_policy_fk" FOREIGN KEY ("workspace_id","policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stocktake_counts_workspace_session_idx" ON "stocktake_counts" USING btree ("workspace_id","session_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "stocktake_sessions_workspace_status_idx" ON "stocktake_sessions" USING btree ("workspace_id","status","as_of","id");