DROP INDEX IF EXISTS "inventory_movements_source_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_movements_source_line_uq";--> statement-breakpoint
DROP INDEX IF EXISTS "inventory_movements_source_document_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_adjustment_source_uq" ON "inventory_movements" USING btree ("workspace_id","source_type","source_id") WHERE "inventory_movements"."source_type" = 'inventory_adjustment';--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_line_source_uq" ON "inventory_movements" USING btree ("workspace_id","source_type","source_id","source_line_id") WHERE "inventory_movements"."source_line_id" is not null;
