ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ORDER_PRODUCT_SNAPSHOT_MISMATCH' BEFORE 'CUSTOMER_ORDER_PRICE_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SUPPLY_COMMITMENT_PRODUCT_SNAPSHOT_MISMATCH' BEFORE 'SUPPLY_COMMITMENT_CURRENCY_MISMATCH';--> statement-breakpoint
ALTER TABLE "customer_order_lines" ADD COLUMN "position" integer;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD COLUMN "position" integer;--> statement-breakpoint
UPDATE "customer_order_lines" AS lines
SET "position" = ranked."position"
FROM (
  SELECT "workspace_id", "id",
    row_number() OVER (PARTITION BY "workspace_id", "customer_order_id" ORDER BY "id") - 1 AS "position"
  FROM "customer_order_lines"
) AS ranked
WHERE ranked."workspace_id" = lines."workspace_id" AND ranked."id" = lines."id";--> statement-breakpoint
UPDATE "supply_commitment_lines" AS lines
SET "position" = ranked."position"
FROM (
  SELECT "workspace_id", "id",
    row_number() OVER (PARTITION BY "workspace_id", "supply_commitment_id" ORDER BY "id") - 1 AS "position"
  FROM "supply_commitment_lines"
) AS ranked
WHERE ranked."workspace_id" = lines."workspace_id" AND ranked."id" = lines."id";--> statement-breakpoint
ALTER TABLE "customer_order_lines" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ALTER COLUMN "position" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_orders" ADD CONSTRAINT "customer_orders_workspace_replacement_fk" FOREIGN KEY ("workspace_id","replaces_customer_order_id") REFERENCES "public"."customer_orders"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitments" ADD CONSTRAINT "supply_commitments_workspace_supplier_fk" FOREIGN KEY ("workspace_id","supplier_id") REFERENCES "public"."suppliers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitments" ADD CONSTRAINT "supply_commitments_workspace_replacement_fk" FOREIGN KEY ("workspace_id","replaces_supply_commitment_id") REFERENCES "public"."supply_commitments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "customer_order_lines_order_position_uq" ON "customer_order_lines" USING btree ("workspace_id","customer_order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "supply_commitment_lines_commitment_position_uq" ON "supply_commitment_lines" USING btree ("workspace_id","supply_commitment_id","position");
