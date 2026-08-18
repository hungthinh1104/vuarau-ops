CREATE INDEX "customer_account_entries_workspace_customer_amount_idx" ON "customer_account_entries" USING btree ("workspace_id","customer_id","amount_minor");--> statement-breakpoint
CREATE INDEX "delivery_lines_workspace_sale_line_idx" ON "delivery_lines" USING btree ("workspace_id","sale_line_id");
