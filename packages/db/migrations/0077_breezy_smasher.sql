CREATE TYPE "public"."fulfilment_remainder_case_kind" AS ENUM('opened', 'decision', 'correction');--> statement-breakpoint
CREATE TYPE "public"."fulfilment_remainder_outcome" AS ENUM('continue_fulfilment', 'commercial_correction', 'cancel_remainder');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'fulfilment_remainder_case.recorded' BEFORE 'document.generated';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'fulfilment_remainder_case' BEFORE 'document';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_SALE_NOT_FOUND' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_SALE_NOT_POSTED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_NOT_PRESENT' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CASE_ALREADY_OPEN' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_OUTCOME_REQUIRED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_DECISION_LINK_INVALID' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_DECISION_TARGET_REQUIRED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_DECISION_NOT_OPEN' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CORRECTION_TARGET_REQUIRED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CORRECTION_TARGET_NOT_FOUND' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CORRECTION_TARGET_ALREADY_CORRECTED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CORRECTION_TARGET_NOT_DECIDED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_SALE_MISMATCH' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'FULFILMENT_REMAINDER_CASE_ALREADY_RECORDED' BEFORE 'DELIVERY_PRODUCT_REQUIRED';--> statement-breakpoint
CREATE TABLE "fulfilment_remainder_cases" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"case_kind" "fulfilment_remainder_case_kind" NOT NULL,
	"outcome" "fulfilment_remainder_outcome",
	"reason" text NOT NULL,
	"related_case_id" uuid,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "fulfilment_remainder_cases_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "fulfilment_remainder_cases_case_link_ck" CHECK (("fulfilment_remainder_cases"."case_kind" = 'correction' and "fulfilment_remainder_cases"."related_case_id" is not null and "fulfilment_remainder_cases"."outcome" is not null)
        or ("fulfilment_remainder_cases"."case_kind" = 'decision' and "fulfilment_remainder_cases"."related_case_id" is null and "fulfilment_remainder_cases"."outcome" is not null)
        or ("fulfilment_remainder_cases"."case_kind" = 'opened' and "fulfilment_remainder_cases"."related_case_id" is null and "fulfilment_remainder_cases"."outcome" is null))
);
--> statement-breakpoint
ALTER TABLE "fulfilment_remainder_cases" ADD CONSTRAINT "fulfilment_remainder_cases_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfilment_remainder_cases" ADD CONSTRAINT "fulfilment_remainder_cases_workspace_sale_fk" FOREIGN KEY ("workspace_id","sale_id") REFERENCES "public"."sales"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fulfilment_remainder_cases" ADD CONSTRAINT "fulfilment_remainder_cases_workspace_related_fk" FOREIGN KEY ("workspace_id","related_case_id") REFERENCES "public"."fulfilment_remainder_cases"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fulfilment_remainder_cases_workspace_sale_time_idx" ON "fulfilment_remainder_cases" USING btree ("workspace_id","sale_id","recorded_at","id");