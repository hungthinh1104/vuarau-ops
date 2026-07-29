DROP INDEX "customer_account_entries_workspace_customer_time_idx";--> statement-breakpoint
CREATE INDEX "customer_account_entries_workspace_time_idx" ON "customer_account_entries" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "supplier_account_entries_workspace_time_idx" ON "supplier_account_entries" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "inventory_movements_workspace_time_idx" ON "inventory_movements" USING btree ("workspace_id","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "deliveries_workspace_status_time_idx" ON "deliveries" USING btree ("workspace_id","status","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE INDEX "customer_account_entries_workspace_customer_time_idx" ON "customer_account_entries" USING btree ("workspace_id","customer_id","transaction_time","recorded_at","id");