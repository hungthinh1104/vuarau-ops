DROP INDEX "payment_allocation_reversals_allocation_idx";--> statement-breakpoint
DROP INDEX "payment_reversals_payment_idx";--> statement-breakpoint
DROP INDEX "purchase_receipts_purchase_idx";--> statement-breakpoint
CREATE INDEX "sale_voids_workspace_sale_time_idx" ON "sale_voids" USING btree ("workspace_id","sale_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "purchase_receipt_reversals_workspace_receipt_time_idx" ON "purchase_receipt_reversals" USING btree ("workspace_id","receipt_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "delivery_return_lines_workspace_delivery_line_idx" ON "delivery_return_lines" USING btree ("workspace_id","delivery_line_id","return_id");--> statement-breakpoint
CREATE INDEX "delivery_returns_workspace_delivery_time_idx" ON "delivery_returns" USING btree ("workspace_id","delivery_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "goods_arrivals_workspace_purchase_time_idx" ON "goods_arrivals" USING btree ("workspace_id","purchase_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "quality_disposition_allocations_workspace_disposition_outcome_idx" ON "quality_disposition_allocations" USING btree ("workspace_id","disposition_id","outcome");--> statement-breakpoint
CREATE INDEX "quality_disposition_reversals_workspace_disposition_time_idx" ON "quality_disposition_reversals" USING btree ("workspace_id","disposition_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "quality_dispositions_workspace_source_arrival_idx" ON "quality_dispositions" USING btree ("workspace_id","source_type","source_arrival_line_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "quality_dispositions_workspace_source_quarantine_idx" ON "quality_dispositions" USING btree ("workspace_id","source_type","source_quarantine_allocation_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "payment_allocation_reversals_allocation_idx" ON "payment_allocation_reversals" USING btree ("workspace_id","allocation_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "payment_reversals_payment_idx" ON "payment_reversals" USING btree ("workspace_id","payment_id","recorded_at","id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_purchase_idx" ON "purchase_receipts" USING btree ("workspace_id","purchase_id","transaction_time","recorded_at","id");