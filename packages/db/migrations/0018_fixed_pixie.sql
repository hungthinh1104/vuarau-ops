CREATE TYPE "public"."delivery_status" AS ENUM('draft', 'cancelled', 'dispatched', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."document_source_type" AS ENUM('sale', 'customer', 'purchase', 'delivery');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('sale_receipt', 'customer_statement', 'purchase_order', 'delivery_note');--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'delivery_dispatch';--> statement-breakpoint
ALTER TYPE "public"."inventory_movement_source_type" ADD VALUE 'delivery_return';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.draft_updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.cancelled';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.dispatched';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.delivered';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'delivery.returned';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'document.generated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'document.shared';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'document.share_revoked';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'delivery';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'document';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_LINE_INVALID' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_VERSION_CONFLICT' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_ALREADY_DISPATCHED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_ALREADY_CANCELLED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_ALREADY_DELIVERED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_QUANTITY_EXCEEDS_SALE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_RETURN_EXCEEDS_DISPATCH' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_PRODUCT_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DELIVERY_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DOCUMENT_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DOCUMENT_SOURCE_INVALID' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DOCUMENT_SHARE_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DOCUMENT_SHARE_REVOKED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'DOCUMENT_SHARE_EXPIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'REPORT_INTEGRITY_FAILURE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"status" "delivery_status" NOT NULL,
	"note" text,
	"cancellation_reason" text,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"sale_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_return_lines" (
	"return_id" uuid NOT NULL,
	"delivery_line_id" uuid NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	CONSTRAINT "delivery_return_lines_return_id_delivery_line_id_pk" PRIMARY KEY("return_id","delivery_line_id")
);
--> statement-breakpoint
CREATE TABLE "delivery_returns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_shares" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"revocation_reason" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"document_type" "document_type" NOT NULL,
	"source_type" "document_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"digest" text NOT NULL,
	"generated_at" timestamp with time zone NOT NULL,
	"generated_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sales_workspace_id_id_uq" ON "sales" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_workspace_id_id_uq" ON "deliveries" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_workspace_sale_fk" FOREIGN KEY ("workspace_id","sale_id") REFERENCES "public"."sales"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_workspace_delivery_fk" FOREIGN KEY ("workspace_id","delivery_id") REFERENCES "public"."deliveries"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_sale_line_fk" FOREIGN KEY ("sale_line_id") REFERENCES "public"."sale_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_return_lines" ADD CONSTRAINT "delivery_return_lines_delivery_line_id_delivery_lines_id_fk" FOREIGN KEY ("delivery_line_id") REFERENCES "public"."delivery_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_return_lines" ADD CONSTRAINT "delivery_return_lines_return_fk" FOREIGN KEY ("return_id") REFERENCES "public"."delivery_returns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_returns" ADD CONSTRAINT "delivery_returns_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_returns" ADD CONSTRAINT "delivery_returns_workspace_delivery_fk" FOREIGN KEY ("workspace_id","delivery_id") REFERENCES "public"."deliveries"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_created_by_actors_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_revoked_by_actors_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_generated_by_actors_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "deliveries_sale_timeline_idx" ON "deliveries" USING btree ("workspace_id","sale_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_lines_delivery_sale_line_uq" ON "delivery_lines" USING btree ("delivery_id","sale_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "delivery_returns_workspace_id_id_uq" ON "delivery_returns" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_shares_token_hash_uq" ON "document_shares" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "document_shares_workspace_id_id_uq" ON "document_shares" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "document_shares_document_idx" ON "document_shares" USING btree ("workspace_id","document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_workspace_id_id_uq" ON "documents" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_source_version_uq" ON "documents" USING btree ("workspace_id","document_type","source_type","source_id","version");--> statement-breakpoint
CREATE INDEX "documents_source_idx" ON "documents" USING btree ("workspace_id","source_type","source_id","version");
