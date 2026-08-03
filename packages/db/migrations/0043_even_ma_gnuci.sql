CREATE TYPE "public"."customer_order_channel" AS ENUM('account_customer', 'walk_in', 'contract_customer', 'internal_transfer');--> statement-breakpoint
CREATE TYPE "public"."customer_order_status" AS ENUM('draft', 'confirmed', 'cancelled');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'customer_order.draft_created' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'customer_order.draft_edited' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'customer_order.confirmed' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'customer_order.cancelled' BEFORE 'payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'customer_order' BEFORE 'payment';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_NOT_FOUND' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_EMPTY' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_LINE_INVALID' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_VERSION_CONFLICT' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_ALREADY_CONFIRMED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_ALREADY_CANCELLED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_CUSTOMER_REQUIRED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_CUSTOMER_NOT_ALLOWED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_PRODUCT_REQUIRED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_PRICE_REQUIRED' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_CURRENCY_MISMATCH' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_REPLACEMENT_INVALID' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_REPLACEMENT_ALREADY_EXISTS' BEFORE 'RECEIPT_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "customer_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_order_id" uuid NOT NULL,
	"product_id" uuid,
	"product_name" text NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"agreed_unit_price_minor" bigint,
	"line_total_minor" bigint,
	"currency" "currency_code" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid,
	"channel" "customer_order_channel" NOT NULL,
	"status" "customer_order_status" NOT NULL,
	"currency" "currency_code" NOT NULL,
	"total_amount_minor" bigint,
	"note" text,
	"payment_terms_label" text,
	"payment_terms_due_at" timestamp with time zone,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"replaces_customer_order_id" uuid,
	CONSTRAINT "customer_orders_channel_customer_check" CHECK ((
        (channel in ('account_customer', 'contract_customer') and customer_id is not null)
        or
        (channel in ('walk_in', 'internal_transfer') and customer_id is null)
      ))
);
--> statement-breakpoint
ALTER TABLE "customer_order_lines" ADD CONSTRAINT "customer_order_lines_customer_order_id_customer_orders_id_fk" FOREIGN KEY ("customer_order_id") REFERENCES "public"."customer_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_lines" ADD CONSTRAINT "customer_order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_order_lines_order_id_id_uq" ON "customer_order_lines" USING btree ("customer_order_id","id");--> statement-breakpoint
CREATE INDEX "customer_order_lines_product_idx" ON "customer_order_lines" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_orders_workspace_id_id_uq" ON "customer_orders" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_orders_replacement_uq" ON "customer_orders" USING btree ("workspace_id","replaces_customer_order_id") WHERE "customer_orders"."replaces_customer_order_id" is not null;--> statement-breakpoint
CREATE INDEX "customer_orders_workspace_time_idx" ON "customer_orders" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "customer_orders_customer_status_time_idx" ON "customer_orders" USING btree ("workspace_id","customer_id","status","transaction_time","recorded_at","id");