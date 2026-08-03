ALTER TYPE "public"."audit_action" ADD VALUE 'debt.payment_allocated' BEFORE 'debt.adjusted';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'debt.payment_allocation_reversed' BEFORE 'debt.adjusted';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_AMOUNT_INVALID' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_NOT_FOUND' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_ALREADY_EXISTS' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_EXCEEDS_PAYMENT' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_EXCEEDS_SALE' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_CURRENCY_MISMATCH' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_SALE_NOT_POSTED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_SALE_VOIDED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_POLICY_NOT_MANUAL' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_REVERSAL_EXCEEDS_REMAINING' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_REVERSAL_ALREADY_EXISTS' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'PAYMENT_ALLOCATION_REVERSAL_REASON_REQUIRED' BEFORE 'DEBT_ADJUSTMENT_REASON_REQUIRED';--> statement-breakpoint
CREATE TABLE "payment_allocation_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"allocation_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"reason" text NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "payment_allocation_reversals_amount_positive_ck" CHECK ("payment_allocation_reversals"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"sale_id" uuid NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"evidence_references" text[] DEFAULT '{}' NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	CONSTRAINT "payment_allocations_amount_positive_ck" CHECK ("payment_allocations"."amount_minor" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_workspace_id_uq" ON "payment_allocations" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_id_uq" ON "payments" USING btree ("workspace_id","id");--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_workspace_allocation_fk" FOREIGN KEY ("workspace_id","allocation_id") REFERENCES "public"."payment_allocations"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_payment_fk" FOREIGN KEY ("workspace_id","payment_id") REFERENCES "public"."payments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_sale_fk" FOREIGN KEY ("workspace_id","sale_id") REFERENCES "public"."sales"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_allocation_reversals_workspace_customer_idx" ON "payment_allocation_reversals" USING btree ("workspace_id","customer_id","transaction_time","id");--> statement-breakpoint
CREATE INDEX "payment_allocation_reversals_allocation_idx" ON "payment_allocation_reversals" USING btree ("workspace_id","allocation_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_workspace_customer_idx" ON "payment_allocations" USING btree ("workspace_id","customer_id","transaction_time","id");--> statement-breakpoint
CREATE INDEX "payment_allocations_payment_idx" ON "payment_allocations" USING btree ("workspace_id","payment_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_sale_idx" ON "payment_allocations" USING btree ("workspace_id","sale_id");--> statement-breakpoint
