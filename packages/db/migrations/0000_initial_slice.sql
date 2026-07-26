CREATE TYPE "public"."command_receipt_status" AS ENUM('in_progress', 'completed');--> statement-breakpoint
CREATE TYPE "public"."currency_code" AS ENUM('VND');--> statement-breakpoint
CREATE TYPE "public"."debt_adjustment_reason_code" AS ENUM('opening_balance', 'write_off', 'data_entry_correction', 'goodwill_discount', 'other');--> statement-breakpoint
CREATE TYPE "public"."ledger_source_type" AS ENUM('order_confirmation', 'payment', 'payment_reversal', 'manual_adjustment');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cash', 'bank_transfer', 'other');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('recorded', 'partially_reversed', 'reversed');--> statement-breakpoint
CREATE TYPE "public"."unit" AS ENUM('kg', 'gram', 'lang', 'bo', 'thung', 'ro', 'kien', 'cai');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('customer.created', 'order.created', 'order.confirmed', 'payment.recorded', 'payment.reversed', 'debt.adjusted');--> statement-breakpoint
CREATE TYPE "public"."audit_aggregate_type" AS ENUM('customer', 'order', 'payment', 'debt');--> statement-breakpoint
CREATE TYPE "public"."domain_rejection_code" AS ENUM('WORKSPACE_ACCESS_DENIED', 'CUSTOMER_NOT_FOUND', 'CUSTOMER_NAME_REQUIRED', 'ORDER_NOT_FOUND', 'ORDER_EMPTY', 'ORDER_LINE_INVALID', 'ORDER_ALREADY_CONFIRMED', 'ORDER_CANCELLED', 'ORDER_VERSION_CONFLICT', 'ORDER_CURRENCY_MISMATCH', 'PAYMENT_AMOUNT_INVALID', 'PAYMENT_NOT_FOUND', 'PAYMENT_ALREADY_REVERSED', 'PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT', 'PAYMENT_REVERSAL_REASON_REQUIRED', 'PAYMENT_VERSION_CONFLICT', 'PAYMENT_CURRENCY_MISMATCH', 'DEBT_ADJUSTMENT_REASON_REQUIRED', 'DEBT_ADJUSTMENT_AMOUNT_INVALID', 'DUPLICATE_COMMAND', 'IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD', 'COMMAND_IN_PROGRESS', 'INVALID_COMMAND_PAYLOAD', 'TRANSACTION_TIME_IN_FUTURE', 'COMMAND_NOT_AVAILABLE');--> statement-breakpoint
CREATE TABLE "actors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_memberships" (
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_memberships_workspace_id_actor_id_pk" PRIMARY KEY("workspace_id","actor_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_unit_price_minor" bigint,
	"currency" "currency_code" DEFAULT 'VND' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"status" "order_status" NOT NULL,
	"currency" "currency_code" NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"note" text,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"method" "payment_method" NOT NULL,
	"payer_name" text,
	"note" text,
	"status" "payment_status" NOT NULL,
	"reversed_amount_minor" bigint DEFAULT 0 NOT NULL,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_debt_summaries" (
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"balance_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"entry_count" integer NOT NULL,
	"last_entry_transaction_time" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "customer_debt_summaries_workspace_id_customer_id_pk" PRIMARY KEY("workspace_id","customer_id")
);
--> statement-breakpoint
CREATE TABLE "debt_ledger_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"source_type" "ledger_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"reversal_of_entry_id" uuid,
	"reason_code" "debt_adjustment_reason_code",
	"reason" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "debt_ledger_entries_source_unique" UNIQUE("source_type","source_id")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"aggregate_type" "audit_aggregate_type" NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"reason" text,
	"rejection_code" "domain_rejection_code"
);
--> statement-breakpoint
CREATE TABLE "command_receipts" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"command_type" text NOT NULL,
	"payload_hash" text NOT NULL,
	"status" "command_receipt_status" NOT NULL,
	"result" jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "command_receipts_workspace_key_unique" UNIQUE("workspace_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_memberships" ADD CONSTRAINT "workspace_memberships_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_debt_summaries" ADD CONSTRAINT "customer_debt_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_debt_summaries" ADD CONSTRAINT "customer_debt_summaries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_ledger_entries" ADD CONSTRAINT "debt_ledger_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_ledger_entries" ADD CONSTRAINT "debt_ledger_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_ledger_entries" ADD CONSTRAINT "debt_ledger_entries_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_memberships_actor_idx" ON "workspace_memberships" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "customers_workspace_name_idx" ON "customers" USING btree ("workspace_id","display_name");--> statement-breakpoint
CREATE INDEX "products_workspace_name_idx" ON "products" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "orders_workspace_status_time_idx" ON "orders" USING btree ("workspace_id","status","transaction_time");--> statement-breakpoint
CREATE INDEX "orders_workspace_customer_time_idx" ON "orders" USING btree ("workspace_id","customer_id","transaction_time");--> statement-breakpoint
CREATE INDEX "payment_reversals_payment_idx" ON "payment_reversals" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_workspace_customer_time_idx" ON "payments" USING btree ("workspace_id","customer_id","transaction_time");--> statement-breakpoint
CREATE INDEX "debt_ledger_entries_workspace_customer_time_idx" ON "debt_ledger_entries" USING btree ("workspace_id","customer_id","transaction_time");--> statement-breakpoint
CREATE INDEX "debt_ledger_entries_command_idx" ON "debt_ledger_entries" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_time_idx" ON "audit_logs" USING btree ("workspace_id","recorded_at");--> statement-breakpoint
CREATE INDEX "audit_logs_aggregate_idx" ON "audit_logs" USING btree ("workspace_id","aggregate_type","aggregate_id");--> statement-breakpoint
CREATE INDEX "audit_logs_command_idx" ON "audit_logs" USING btree ("command_id");--> statement-breakpoint
CREATE INDEX "command_receipts_workspace_time_idx" ON "command_receipts" USING btree ("workspace_id","recorded_at");