CREATE TYPE "public"."cash_account_kind" AS ENUM('cash_drawer', 'bank', 'mobile_wallet', 'employee_holding', 'owner_funds', 'other');--> statement-breakpoint
CREATE TYPE "public"."cash_adjustment_reason_code" AS ENUM('opening_balance', 'owner_contribution', 'owner_draw', 'count_correction', 'unidentified_cash', 'other');--> statement-breakpoint
CREATE TYPE "public"."cash_movement_source_type" AS ENUM('customer_payment', 'customer_payment_reversal', 'supplier_payment', 'supplier_payment_reversal', 'expense', 'expense_reversal', 'cash_transfer_out', 'cash_transfer_in', 'cash_transfer_reversal_out', 'cash_transfer_reversal_in', 'cash_adjustment');--> statement-breakpoint
CREATE TYPE "public"."cashbook_mode" AS ENUM('disabled', 'accounts_ledger');--> statement-breakpoint
CREATE TYPE "public"."expense_category" AS ENUM('transport', 'loading', 'market_fee', 'fuel', 'wages', 'packaging', 'utilities', 'maintenance', 'owner_personal', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_account.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_account.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_account.deactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_account.reactivated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'expense.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'expense.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_transfer.recorded';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash_transfer.reversed';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash.adjusted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'cash.projection_rebuilt';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'cash_account';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'expense';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'cash_transfer';--> statement-breakpoint
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'cash';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_INACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_VERSION_CONFLICT' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_ALREADY_INACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_ALREADY_ACTIVE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_CUSTODIAN_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_REQUIRED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_CURRENCY_MISMATCH' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_ACCOUNT_LINK_MISMATCH' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_AMOUNT_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'EXPENSE_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'EXPENSE_ALREADY_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_TRANSFER_INVALID' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_TRANSFER_NOT_FOUND' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_TRANSFER_ALREADY_REVERSED' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_RECONCILIATION_INTEGRITY_FAILURE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CASH_RECONCILIATION_REBUILD_UNSAFE' BEFORE 'COMMAND_NOT_AVAILABLE';--> statement-breakpoint
CREATE TABLE "cash_accounts" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"kind" "cash_account_kind" NOT NULL,
	"currency" "currency_code" DEFAULT 'VND' NOT NULL,
	"custodian_actor_id" uuid,
	"note" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_accounts_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_accounts_custodian_ck" CHECK (("cash_accounts"."kind" = 'employee_holding' and "cash_accounts"."custodian_actor_id" is not null)
        or ("cash_accounts"."kind" <> 'employee_holding' and "cash_accounts"."custodian_actor_id" is null)),
	CONSTRAINT "cash_accounts_version_ck" CHECK ("cash_accounts"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "cash_adjustments" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"reason_code" "cash_adjustment_reason_code" NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_adjustments_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_adjustments_amount_ck" CHECK ("cash_adjustments"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "cash_balances" (
	"workspace_id" uuid NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"balance_minor" bigint DEFAULT 0 NOT NULL,
	"currency" "currency_code" DEFAULT 'VND' NOT NULL,
	"movement_count" integer DEFAULT 0 NOT NULL,
	"last_movement_transaction_time" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_balances_workspace_id_cash_account_id_pk" PRIMARY KEY("workspace_id","cash_account_id")
);
--> statement-breakpoint
CREATE TABLE "cash_movements" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"source_type" "cash_movement_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"reversal_of_movement_id" uuid,
	"note" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_movements_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_movements_amount_ck" CHECK ("cash_movements"."amount_minor" <> 0)
);
--> statement-breakpoint
CREATE TABLE "cash_transfer_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"transfer_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_transfer_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "cash_transfers" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_cash_account_id" uuid NOT NULL,
	"to_cash_account_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"note" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "cash_transfers_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "cash_transfers_accounts_ck" CHECK ("cash_transfers"."from_cash_account_id" <> "cash_transfers"."to_cash_account_id"),
	CONSTRAINT "cash_transfers_amount_ck" CHECK ("cash_transfers"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_reversals" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"expense_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "expense_reversals_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"payee" text,
	"note" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "expenses_workspace_id_id_pk" PRIMARY KEY("workspace_id","id"),
	CONSTRAINT "expenses_amount_ck" CHECK ("expenses"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspace_operational_profiles" ADD COLUMN "cashbook_mode" "cashbook_mode" DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "cash_account_id" uuid;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD COLUMN "cash_account_id" uuid;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD CONSTRAINT "cash_accounts_custodian_actor_id_actors_id_fk" FOREIGN KEY ("custodian_actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_adjustments" ADD CONSTRAINT "cash_adjustments_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_adjustments" ADD CONSTRAINT "cash_adjustments_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_adjustments" ADD CONSTRAINT "cash_adjustments_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_balances" ADD CONSTRAINT "cash_balances_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" ADD CONSTRAINT "cash_transfer_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" ADD CONSTRAINT "cash_transfer_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" ADD CONSTRAINT "cash_transfer_reversals_workspace_transfer_fk" FOREIGN KEY ("workspace_id","transfer_id") REFERENCES "public"."cash_transfers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_workspace_from_account_fk" FOREIGN KEY ("workspace_id","from_cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_workspace_to_account_fk" FOREIGN KEY ("workspace_id","to_cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reversals" ADD CONSTRAINT "expense_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reversals" ADD CONSTRAINT "expense_reversals_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reversals" ADD CONSTRAINT "expense_reversals_workspace_expense_fk" FOREIGN KEY ("workspace_id","expense_id") REFERENCES "public"."expenses"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_accounts_workspace_id_id_uq" ON "cash_accounts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "cash_accounts_workspace_name_idx" ON "cash_accounts" USING btree ("workspace_id","display_name","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_movements_source_account_uq" ON "cash_movements" USING btree ("workspace_id","source_type","source_id","cash_account_id");--> statement-breakpoint
CREATE INDEX "cash_movements_account_time_idx" ON "cash_movements" USING btree ("workspace_id","cash_account_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_transfer_reversals_transfer_uq" ON "cash_transfer_reversals" USING btree ("workspace_id","transfer_id");--> statement-breakpoint
CREATE INDEX "cash_transfers_workspace_time_idx" ON "cash_transfers" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_reversals_expense_uq" ON "expense_reversals" USING btree ("workspace_id","expense_id");--> statement-breakpoint
CREATE INDEX "expenses_account_time_idx" ON "expenses" USING btree ("workspace_id","cash_account_id","transaction_time","recorded_at","id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_workspace_cash_account_fk" FOREIGN KEY ("workspace_id","cash_account_id") REFERENCES "public"."cash_accounts"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements"
  ADD CONSTRAINT "cash_movements_workspace_reversal_fk"
  FOREIGN KEY ("workspace_id", "reversal_of_movement_id")
  REFERENCES "cash_movements"("workspace_id", "id");
--> statement-breakpoint
CREATE TRIGGER cash_adjustments_append_only
  BEFORE UPDATE OR DELETE ON cash_adjustments
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER cash_movements_append_only
  BEFORE UPDATE OR DELETE ON cash_movements
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER expenses_append_only
  BEFORE UPDATE OR DELETE ON expenses
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER expense_reversals_append_only
  BEFORE UPDATE OR DELETE ON expense_reversals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER cash_transfers_append_only
  BEFORE UPDATE OR DELETE ON cash_transfers
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER cash_transfer_reversals_append_only
  BEFORE UPDATE OR DELETE ON cash_transfer_reversals
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION vuarau_cash_account_link_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.cash_account_id IS DISTINCT FROM OLD.cash_account_id THEN
    RAISE EXCEPTION
      'cash_account_id on % is immutable after recording; reverse the source fact instead.',
      TG_TABLE_NAME
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER payments_cash_account_immutable
  BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION vuarau_cash_account_link_immutable();
--> statement-breakpoint
CREATE TRIGGER supplier_payments_cash_account_immutable
  BEFORE UPDATE ON supplier_payments
  FOR EACH ROW EXECUTE FUNCTION vuarau_cash_account_link_immutable();
