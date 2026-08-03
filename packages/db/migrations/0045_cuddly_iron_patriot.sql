ALTER TYPE "public"."workspace_policy_kind" ADD VALUE 'purchase_correction' BEFORE 'payment_terms_aging';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_CORRECTION_POLICY_UNAVAILABLE' BEFORE 'PURCHASE_VOID_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_POLICY_DEFINITION_INVALID' BEFORE 'WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID';--> statement-breakpoint
ALTER TABLE "purchase_voids" ADD COLUMN "policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_voids" ADD CONSTRAINT "purchase_voids_workspace_policy_fk" FOREIGN KEY ("workspace_id","policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;
