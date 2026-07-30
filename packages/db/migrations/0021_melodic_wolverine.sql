ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'inventory_reclassification';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_grade.created' BEFORE 'workspace.backup_exported';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_grade.updated' BEFORE 'workspace.backup_exported';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_grade.deactivated' BEFORE 'workspace.backup_exported';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'quality_grade.reactivated' BEFORE 'workspace.backup_exported';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'inventory.reclassified' BEFORE 'inventory.projection_rebuilt';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'quality_grade' BEFORE 'workspace';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_GRADE_NOT_FOUND' BEFORE 'SUPPLIER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_GRADE_INACTIVE' BEFORE 'SUPPLIER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'QUALITY_GRADE_VERSION_CONFLICT' BEFORE 'SUPPLIER_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'INVENTORY_RECLASSIFICATION_INVALID' BEFORE 'INVENTORY_RECONCILIATION_INTEGRITY_FAILURE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'INVENTORY_RECLASSIFICATION_REASON_REQUIRED' BEFORE 'INVENTORY_RECONCILIATION_INTEGRITY_FAILURE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_PRODUCT_REQUIRED' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_PRODUCT_NOT_FOUND' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_PRODUCT_INACTIVE' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_PRODUCT_SNAPSHOT_MISMATCH' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_QUALITY_GRADE_REQUIRED' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_QUALITY_GRADE_NOT_FOUND' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_QUALITY_GRADE_INACTIVE' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_QUALITY_GRADE_SNAPSHOT_MISMATCH' BEFORE 'SALE_ALREADY_POSTED';--> statement-breakpoint
CREATE TABLE "quality_grades" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "inventory_movements_timeline_idx";--> statement-breakpoint
ALTER TABLE "inventory_balances" DROP CONSTRAINT "inventory_balances_workspace_id_product_id_unit_pk";--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "quality_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD COLUMN "quality_grade_name" text;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD COLUMN "quality_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "quality_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD COLUMN "quality_grade_name" text;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD COLUMN "quality_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD COLUMN "quality_grade_name" text;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD COLUMN "quality_grade_id" uuid;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD COLUMN "quality_grade_name" text;--> statement-breakpoint
ALTER TABLE "quality_grades" ADD CONSTRAINT "quality_grades_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quality_grades_workspace_id_id_uq" ON "quality_grades" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "quality_grades_workspace_name_uq" ON "quality_grades" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "quality_grades_workspace_order_idx" ON "quality_grades" USING btree ("workspace_id","sort_order","name","id");--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_movements_timeline_idx" ON "inventory_movements" USING btree ("workspace_id","product_id","quality_grade_id","unit","transaction_time","recorded_at","id");--> statement-breakpoint
ALTER TABLE "inventory_balances" ADD CONSTRAINT "inventory_balances_workspace_product_grade_unit_uq" UNIQUE NULLS NOT DISTINCT("workspace_id","product_id","quality_grade_id","unit");