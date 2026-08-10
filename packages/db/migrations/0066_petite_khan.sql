ALTER TABLE "payment_allocation_reversals" DROP CONSTRAINT "payment_allocation_reversals_workspace_allocation_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_workspace_payment_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_workspace_sale_fk";
--> statement-breakpoint
DROP INDEX "payment_reversals_payment_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "sales_workspace_id_customer_uq" ON "sales" USING btree ("workspace_id","id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_allocations_workspace_id_customer_uq" ON "payment_allocations" USING btree ("workspace_id","id","customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_workspace_id_customer_uq" ON "payments" USING btree ("workspace_id","id","customer_id");--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_workspace_allocation_customer_fk" FOREIGN KEY ("workspace_id","allocation_id","customer_id") REFERENCES "public"."payment_allocations"("workspace_id","id","customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_payment_customer_fk" FOREIGN KEY ("workspace_id","payment_id","customer_id") REFERENCES "public"."payments"("workspace_id","id","customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_sale_customer_fk" FOREIGN KEY ("workspace_id","sale_id","customer_id") REFERENCES "public"."sales"("workspace_id","id","customer_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_workspace_payment_fk" FOREIGN KEY ("workspace_id","payment_id") REFERENCES "public"."payments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_reversals" ADD CONSTRAINT "supplier_payment_reversals_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payments" ADD CONSTRAINT "supplier_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_reversals_payment_idx" ON "payment_reversals" USING btree ("workspace_id","payment_id");
