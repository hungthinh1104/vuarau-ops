CREATE TYPE "public"."workspace_policy_kind" AS ENUM('receivable_payable_recognition', 'inventory_valuation', 'cost_allocation', 'return_claim_credit', 'payment_terms_aging', 'payment_allocation', 'credit_limit', 'stock_planning_reorder', 'stocktake_variance', 'supplier_evaluation', 'operating_cycle_reconciliation', 'cash_custody_deposit');--> statement-breakpoint
CREATE TYPE "public"."workspace_policy_state" AS ENUM('draft', 'approved', 'retired');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'workspace_policy.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'workspace_policy.approved';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'workspace_policy.retired';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'workspace_policy';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_ALREADY_EXISTS' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_NOT_DRAFT' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_NOT_APPROVED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_EVIDENCE_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_VERSION_CONFLICT' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "workspace_policies" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"policy_kind" "workspace_policy_kind" NOT NULL,
	"version" integer NOT NULL,
	"state" "workspace_policy_state" DEFAULT 'draft' NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"effective_to" timestamp with time zone,
	"definition" jsonb NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"retired_by" uuid,
	"retired_at" timestamp with time zone,
	"command_id" uuid NOT NULL,
	"reason" text,
	CONSTRAINT "workspace_policies_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "workspace_policies_kind_version_uq" UNIQUE("workspace_id","policy_kind","version"),
	CONSTRAINT "workspace_policies_effective_range_ck" CHECK ("workspace_policies"."effective_to" is null or "workspace_policies"."effective_to" > "workspace_policies"."effective_from"),
	CONSTRAINT "workspace_policies_version_ck" CHECK ("workspace_policies"."version" >= 1),
	CONSTRAINT "workspace_policies_approval_ck" CHECK ("workspace_policies"."state" <> 'approved'
        or ("workspace_policies"."approved_by" is not null and "workspace_policies"."approved_at" is not null
          and cardinality("workspace_policies"."evidence_references") > 0)),
	CONSTRAINT "workspace_policies_retirement_ck" CHECK ("workspace_policies"."state" <> 'retired'
        or ("workspace_policies"."retired_by" is not null and "workspace_policies"."retired_at" is not null))
);
--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_approved_by_actors_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_retired_by_actors_id_fk" FOREIGN KEY ("retired_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_policies_workspace_kind_idx" ON "workspace_policies" USING btree ("workspace_id","policy_kind","version");--> statement-breakpoint
CREATE INDEX "workspace_policies_workspace_state_idx" ON "workspace_policies" USING btree ("workspace_id","state","effective_from");