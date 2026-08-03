CREATE TYPE "public"."supply_commitment_status" AS ENUM('draft', 'confirmed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supply_commitment.draft_created' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supply_commitment.draft_edited' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supply_commitment.confirmed' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supply_commitment.cancelled' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supply_commitment' BEFORE 'payment';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_NOT_FOUND' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_EMPTY' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_LINE_INVALID' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_VERSION_CONFLICT' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_ALREADY_CONFIRMED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_ALREADY_CANCELLED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_PRODUCT_REQUIRED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_CURRENCY_MISMATCH' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_REPLACEMENT_INVALID' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_REPLACEMENT_ALREADY_EXISTS' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "supply_commitment_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supply_commitment_id" uuid NOT NULL,
	"product_id" uuid,
	"quality_grade_id" uuid,
	"product_name" text NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"agreed_unit_price_minor" bigint,
	"line_total_minor" bigint,
	"currency" "currency_code" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supply_commitments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "supply_commitment_status" NOT NULL,
	"currency" "currency_code" NOT NULL,
	"total_amount_minor" bigint,
	"expected_arrival_at" timestamp with time zone,
	"payment_terms_label" text,
	"payment_terms_due_at" timestamp with time zone,
	"note" text,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"replaces_supply_commitment_id" uuid
);
--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_supply_commitment_id_supply_commitments_id_fk" FOREIGN KEY ("supply_commitment_id") REFERENCES "public"."supply_commitments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_quality_grade_id_quality_grades_id_fk" FOREIGN KEY ("quality_grade_id") REFERENCES "public"."quality_grades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitments" ADD CONSTRAINT "supply_commitments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitments" ADD CONSTRAINT "supply_commitments_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supply_commitment_lines_commitment_id_id_uq" ON "supply_commitment_lines" USING btree ("supply_commitment_id","id");--> statement-breakpoint
CREATE INDEX "supply_commitment_lines_product_idx" ON "supply_commitment_lines" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_commitments_workspace_id_id_uq" ON "supply_commitments" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_commitments_replacement_uq" ON "supply_commitments" USING btree ("workspace_id","replaces_supply_commitment_id") WHERE "supply_commitments"."replaces_supply_commitment_id" is not null;--> statement-breakpoint
CREATE INDEX "supply_commitments_workspace_time_idx" ON "supply_commitments" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "supply_commitments_supplier_status_time_idx" ON "supply_commitments" USING btree ("workspace_id","supplier_id","status","transaction_time","recorded_at","id");