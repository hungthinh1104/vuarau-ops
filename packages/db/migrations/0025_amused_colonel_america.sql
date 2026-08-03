CREATE TYPE "public"."delivery_mode" AS ENUM('disabled', 'sale_fulfilment');--> statement-breakpoint
CREATE TYPE "public"."inventory_mode" AS ENUM('disabled', 'movement_ledger');--> statement-breakpoint
CREATE TYPE "public"."purchasing_mode" AS ENUM('disabled', 'purchase_receiving');--> statement-breakpoint
CREATE TYPE "public"."quality_grade_mode" AS ENUM('disabled', 'required');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'workspace.operational_profile_updated' BEFORE 'supplier.created';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_PROFILE_VERSION_CONFLICT' BEFORE 'BACKUP_DIGEST_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_PROFILE_UNCHANGED' BEFORE 'BACKUP_DIGEST_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_WORKFLOW_DISABLED' BEFORE 'BACKUP_DIGEST_INVALID';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_GRADE_NOT_USED' BEFORE 'SUPPLIER_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "workspace_operational_profiles" (
	"workspace_id" uuid PRIMARY KEY NOT NULL,
	"purchasing_mode" "purchasing_mode" DEFAULT 'purchase_receiving' NOT NULL,
	"inventory_mode" "inventory_mode" DEFAULT 'movement_ledger' NOT NULL,
	"quality_grade_mode" "quality_grade_mode" DEFAULT 'required' NOT NULL,
	"delivery_mode" "delivery_mode" DEFAULT 'sale_fulfilment' NOT NULL,
	"business_day_start_minute" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_operational_profiles_day_start_ck" CHECK ("workspace_operational_profiles"."business_day_start_minute" between 0 and 1439),
	CONSTRAINT "workspace_operational_profiles_dependencies_ck" CHECK ("workspace_operational_profiles"."inventory_mode" <> 'disabled'
        or ("workspace_operational_profiles"."purchasing_mode" = 'disabled'
          and "workspace_operational_profiles"."quality_grade_mode" = 'disabled'
          and "workspace_operational_profiles"."delivery_mode" = 'disabled')),
	CONSTRAINT "workspace_operational_profiles_version_ck" CHECK ("workspace_operational_profiles"."version" >= 1)
);
--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD CONSTRAINT "workspace_operational_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
INSERT INTO "workspace_operational_profiles" ("workspace_id")
SELECT "id" FROM "workspaces"
ON CONFLICT ("workspace_id") DO NOTHING;
