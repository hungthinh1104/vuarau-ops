CREATE TYPE "public"."inventory_movement_source_type" AS ENUM('purchase_receipt', 'purchase_receipt_reversal', 'inventory_adjustment');--> statement-breakpoint
CREATE TABLE "inventory_balances" (
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"unit" "unit" NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"movement_count" integer NOT NULL,
	"last_movement_transaction_time" timestamp with time zone,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "inventory_balances_workspace_id_product_id_unit_pk" PRIMARY KEY("workspace_id","product_id","unit")
);
--> statement-breakpoint
CREATE TABLE "inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"source_type" "inventory_movement_source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"source_line_id" uuid,
	"reversal_of_movement_id" uuid,
	"reason_code" text,
	"reason" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL,
	"command_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"purchase_line_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipt_reversals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_receipts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"note" text,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_command_id_command_receipts_command_id_fk" FOREIGN KEY ("command_id") REFERENCES "public"."command_receipts"("command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_purchase_line_id_purchase_lines_id_fk" FOREIGN KEY ("purchase_line_id") REFERENCES "public"."purchase_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" ADD CONSTRAINT "purchase_receipt_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_reversals" ADD CONSTRAINT "purchase_receipt_reversals_receipt_id_purchase_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."purchase_receipts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipt_reversals" ADD CONSTRAINT "purchase_receipt_reversals_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_receipts" ADD CONSTRAINT "purchase_receipts_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_source_line_uq"
  ON "inventory_movements" ("workspace_id","source_type","source_id","source_line_id")
  WHERE "source_line_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_source_document_uq"
  ON "inventory_movements" ("workspace_id","source_type","source_id")
  WHERE "source_line_id" IS NULL;--> statement-breakpoint
CREATE INDEX "inventory_movements_timeline_idx" ON "inventory_movements" USING btree ("workspace_id","product_id","unit","transaction_time","recorded_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_lines_receipt_line_uq" ON "purchase_receipt_lines" USING btree ("receipt_id","purchase_line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipt_reversals_receipt_uq" ON "purchase_receipt_reversals" USING btree ("workspace_id","receipt_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_receipts_workspace_id_id_uq" ON "purchase_receipts" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "purchase_receipts_purchase_idx" ON "purchase_receipts" USING btree ("workspace_id","purchase_id","transaction_time");
--> statement-breakpoint
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_quantity_nonzero" CHECK ("quantity_scaled" <> 0);
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines"
  ADD CONSTRAINT "purchase_receipt_lines_quantity_positive" CHECK ("quantity_scaled" > 0);
--> statement-breakpoint
ALTER TABLE "purchase_receipt_reversals"
  ADD CONSTRAINT "purchase_receipt_reversals_reason_nonblank" CHECK (length(btrim("reason")) > 0);
--> statement-breakpoint
CREATE TRIGGER "inventory_movements_append_only"
  BEFORE UPDATE OR DELETE ON "inventory_movements"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER "purchase_receipts_append_only"
  BEFORE UPDATE OR DELETE ON "purchase_receipts"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER "purchase_receipt_lines_append_only"
  BEFORE UPDATE OR DELETE ON "purchase_receipt_lines"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
--> statement-breakpoint
CREATE TRIGGER "purchase_receipt_reversals_append_only"
  BEFORE UPDATE OR DELETE ON "purchase_receipt_reversals"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
