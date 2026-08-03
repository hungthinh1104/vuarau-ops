CREATE TYPE "public"."payment_term_source" AS ENUM('sale_override', 'customer_policy', 'workspace_policy', 'none');--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_terms_policy_version_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_terms_source" "payment_term_source";--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_workspace_payment_terms_policy_fk" FOREIGN KEY ("workspace_id","payment_terms_policy_version_id") REFERENCES "public"."workspace_policies"("workspace_id","id") ON DELETE no action ON UPDATE no action;