CREATE UNIQUE INDEX "purchase_lines_workspace_purchase_id_id_uq" ON "purchase_lines" USING btree ("workspace_id","purchase_id","id");
--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" DROP CONSTRAINT "goods_arrival_lines_purchase_line_fk";
--> statement-breakpoint
ALTER TABLE "goods_arrival_lines" ADD CONSTRAINT "goods_arrival_lines_workspace_purchase_line_fk" FOREIGN KEY ("workspace_id","purchase_id","purchase_line_id") REFERENCES "public"."purchase_lines"("workspace_id","purchase_id","id") ON DELETE no action ON UPDATE no action;
