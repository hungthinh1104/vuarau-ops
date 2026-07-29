CREATE TYPE "public"."supplier_account_source_type" AS ENUM('supplier_payment', 'supplier_payment_reversal', 'manual_adjustment', 'purchase_confirmation', 'purchase_void');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier.deactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier.reactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier_payment.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier_payment.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier_account.adjusted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'supplier_account.projection_rebuilt';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'purchase.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'purchase.draft_edited';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'purchase.discarded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'purchase.confirmed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'purchase.voided';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'receipt.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'receipt.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'inventory.adjusted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'inventory.projection_rebuilt';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supplier';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supplier_payment';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'supplier_account';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'purchase';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'receipt';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'inventory';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_INACTIVE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_VERSION_CONFLICT' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_PAYMENT_AMOUNT_INVALID' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_PAYMENT_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_PAYMENT_ALREADY_REVERSED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_PAYMENT_REVERSAL_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_ACCOUNT_ADJUSTMENT_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_ACCOUNT_ADJUSTMENT_AMOUNT_INVALID' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLIER_ACCOUNT_RECONCILIATION_REBUILD_UNSAFE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_EMPTY' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_LINE_INVALID' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_VERSION_CONFLICT' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_ALREADY_CONFIRMED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_ALREADY_DISCARDED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_ALREADY_VOIDED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_HAS_ACTIVE_RECEIPTS' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PURCHASE_VOID_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECEIPT_NOT_FOUND' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECEIPT_ALREADY_REVERSED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECEIPT_QUANTITY_EXCEEDS_PURCHASE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECEIPT_UNIT_MISMATCH' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'RECEIPT_REVERSAL_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'INVENTORY_ADJUSTMENT_REASON_REQUIRED' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'INVENTORY_RECONCILIATION_INTEGRITY_FAILURE' BEFORE 'SALE_NOT_FOUND';--> statement-breakpoint
CREATE TABLE "supplier_account_balances" (
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"balance_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"entry_count" integer NOT NULL,
	"last_entry_transaction_time" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "supplier_account_balances_workspace_id_supplier_id_pk" PRIMARY KEY("workspace_id","supplier_id")
);
--> statement-breakpoint
CREATE TABLE "supplier_account_entries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"source_type" "supplier_account_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"reversal_of_entry_id" uuid,
	"reason_code" text,
	"reason" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_payment_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"method" "payment_method" NOT NULL,
	"note" text,
	"reversed_amount_minor" bigint DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"phone" text,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_account_entries_source_uq" ON "supplier_account_entries" USING btree ("workspace_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "supplier_account_entries_timeline_idx" ON "supplier_account_entries" USING btree ("workspace_id","supplier_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "supplier_payment_reversals_payment_idx" ON "supplier_payment_reversals" USING btree ("workspace_id","supplier_payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_payments_workspace_id_id_uq" ON "supplier_payments" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "supplier_payments_supplier_time_idx" ON "supplier_payments" USING btree ("workspace_id","supplier_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_workspace_id_id_uq" ON "suppliers" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "suppliers_workspace_name_idx" ON "suppliers" USING btree ("workspace_id","display_name","id");
--> statement-breakpoint
ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_supplier_fk"
  FOREIGN KEY ("workspace_id", "supplier_id")
  REFERENCES "suppliers" ("workspace_id", "id");
--> statement-breakpoint
ALTER TABLE "supplier_payment_reversals"
  ADD CONSTRAINT "supplier_payment_reversals_payment_fk"
  FOREIGN KEY ("workspace_id", "supplier_payment_id")
  REFERENCES "supplier_payments" ("workspace_id", "id");
--> statement-breakpoint
ALTER TABLE "supplier_account_entries"
  ADD CONSTRAINT "supplier_account_entries_supplier_fk"
  FOREIGN KEY ("workspace_id", "supplier_id")
  REFERENCES "suppliers" ("workspace_id", "id");
--> statement-breakpoint
ALTER TABLE "supplier_account_balances"
  ADD CONSTRAINT "supplier_account_balances_supplier_fk"
  FOREIGN KEY ("workspace_id", "supplier_id")
  REFERENCES "suppliers" ("workspace_id", "id");
--> statement-breakpoint
ALTER TABLE "supplier_payments"
  ADD CONSTRAINT "supplier_payments_amount_positive" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "supplier_payments_reversed_valid"
    CHECK ("reversed_amount_minor" >= 0 AND "reversed_amount_minor" <= "amount_minor");
--> statement-breakpoint
ALTER TABLE "supplier_payment_reversals"
  ADD CONSTRAINT "supplier_payment_reversals_amount_positive" CHECK ("amount_minor" > 0),
  ADD CONSTRAINT "supplier_payment_reversals_reason_nonblank" CHECK (length(btrim("reason")) > 0);
--> statement-breakpoint
ALTER TABLE "supplier_account_entries"
  ADD CONSTRAINT "supplier_account_entries_amount_nonzero" CHECK ("amount_minor" <> 0);
--> statement-breakpoint
CREATE TRIGGER "supplier_account_entries_append_only"
  BEFORE UPDATE OR DELETE ON "supplier_account_entries"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
