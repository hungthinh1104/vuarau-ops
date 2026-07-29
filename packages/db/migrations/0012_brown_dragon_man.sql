CREATE TYPE "public"."purchase_status" AS ENUM('draft', 'confirmed', 'discarded');--> statement-breakpoint
CREATE TABLE "purchase_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"quantity_scaled" bigint NOT NULL,
	"unit" "unit" NOT NULL,
	"unit_price_minor" bigint NOT NULL,
	"line_total_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_voids" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"purchase_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"reason" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" "currency_code" NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"actor_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supplier_id" uuid NOT NULL,
	"status" "purchase_status" NOT NULL,
	"currency" "currency_code" NOT NULL,
	"total_amount_minor" bigint NOT NULL,
	"note" text,
	"due_at" timestamp with time zone,
	"version" integer NOT NULL,
	"transaction_time" timestamp with time zone NOT NULL,
	"recorded_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	"discarded_at" timestamp with time zone,
	"replaces_purchase_id" uuid
);
--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_voids" ADD CONSTRAINT "purchase_voids_purchase_id_purchases_id_fk" FOREIGN KEY ("purchase_id") REFERENCES "public"."purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_voids" ADD CONSTRAINT "purchase_voids_actor_id_actors_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."actors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_lines_purchase_id_id_uq" ON "purchase_lines" USING btree ("purchase_id","id");--> statement-breakpoint
CREATE INDEX "purchase_lines_product_idx" ON "purchase_lines" USING btree ("workspace_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_voids_purchase_uq" ON "purchase_voids" USING btree ("workspace_id","purchase_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_workspace_id_id_uq" ON "purchases" USING btree ("workspace_id","id");--> statement-breakpoint
CREATE INDEX "purchases_workspace_time_idx" ON "purchases" USING btree ("workspace_id","transaction_time","recorded_at","id");
--> statement-breakpoint
ALTER TABLE "purchase_lines"
  ADD CONSTRAINT "purchase_lines_quantity_positive" CHECK ("quantity_scaled" > 0),
  ADD CONSTRAINT "purchase_lines_unit_price_nonnegative" CHECK ("unit_price_minor" >= 0),
  ADD CONSTRAINT "purchase_lines_total_nonnegative" CHECK ("line_total_minor" >= 0);
--> statement-breakpoint
ALTER TABLE "purchase_voids"
  ADD CONSTRAINT "purchase_voids_reason_nonblank" CHECK (length(btrim("reason")) > 0);
--> statement-breakpoint
CREATE UNIQUE INDEX "purchases_replacement_uq"
  ON "purchases" ("workspace_id", "replaces_purchase_id")
  WHERE "replaces_purchase_id" IS NOT NULL;
--> statement-breakpoint
CREATE TRIGGER "purchase_voids_append_only"
  BEFORE UPDATE OR DELETE ON "purchase_voids"
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_mutation();
