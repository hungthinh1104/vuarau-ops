CREATE UNIQUE INDEX "delivery_lines_workspace_id_uq" ON "delivery_lines" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "delivery_return_lines"
  ADD CONSTRAINT "delivery_return_lines_workspace_delivery_line_fk"
  FOREIGN KEY ("workspace_id","delivery_line_id")
  REFERENCES "public"."delivery_lines"("workspace_id","id")
  ON DELETE no action ON UPDATE no action;
