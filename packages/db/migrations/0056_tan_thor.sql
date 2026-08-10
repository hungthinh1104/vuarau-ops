DO $$
DECLARE
  relation record;
  join_predicate text;
  mismatch_count bigint;
BEGIN
  /*
   * Before replacing scalar tenant-local FKs, prove that existing rows already
   * agree with the workspace carried by their parent. This is catalog-driven so
   * a new tenant-local FK cannot silently bypass the migration preflight.
   */
  FOR relation IN
    SELECT
      c.oid,
      c.conname,
      c.conrelid,
      c.confrelid,
      n.nspname AS child_schema,
      pn.nspname AS parent_schema,
      c.conkey,
      c.confkey
    FROM pg_constraint c
    JOIN pg_class child_table ON child_table.oid = c.conrelid
    JOIN pg_class parent_table ON parent_table.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = child_table.relnamespace
    JOIN pg_namespace pn ON pn.oid = parent_table.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND pn.nspname = 'public'
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.conrelid
          AND a.attname = 'workspace_id'
          AND NOT a.attisdropped
      )
      AND EXISTS (
        SELECT 1
        FROM pg_attribute a
        WHERE a.attrelid = c.confrelid
          AND a.attname = 'workspace_id'
          AND NOT a.attisdropped
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(c.conkey) AS key(attnum)
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
        WHERE a.attname = 'workspace_id'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM unnest(c.confkey) AS key(attnum)
        JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = key.attnum
        WHERE a.attname = 'workspace_id'
      )
  LOOP
    SELECT string_agg(
      format('child.%I = parent.%I', child_column.attname, parent_column.attname),
      ' AND ' ORDER BY keys.ordinality
    )
    INTO join_predicate
    FROM unnest(relation.conkey, relation.confkey) WITH ORDINALITY AS keys(child_attnum, parent_attnum, ordinality)
    JOIN pg_attribute child_column
      ON child_column.attrelid = relation.conrelid AND child_column.attnum = keys.child_attnum
    JOIN pg_attribute parent_column
      ON parent_column.attrelid = relation.confrelid AND parent_column.attnum = keys.parent_attnum;

    EXECUTE format(
      'SELECT count(*) FROM %I.%I AS child JOIN %I.%I AS parent ON %s WHERE child.workspace_id <> parent.workspace_id',
      relation.child_schema,
      (SELECT relname FROM pg_class WHERE oid = relation.conrelid),
      relation.parent_schema,
      (SELECT relname FROM pg_class WHERE oid = relation.confrelid),
      join_predicate
    ) INTO mismatch_count;

    IF mismatch_count > 0 THEN
      RAISE EXCEPTION 'tenant integrity preflight failed for FK %, mismatched rows: %',
        relation.conname, mismatch_count;
    END IF;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX "sale_lines_workspace_id_id_uq" ON "sale_lines" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_order_lines_workspace_id_id_uq" ON "customer_order_lines" USING btree ("workspace_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "supply_commitment_lines_workspace_id_id_uq" ON "supply_commitment_lines" USING btree ("workspace_id","id");
--> statement-breakpoint
ALTER TABLE "command_receipts" ADD CONSTRAINT "command_receipts_workspace_command_unique" UNIQUE("workspace_id","command_id");
--> statement-breakpoint
ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_sale_id_sales_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_lines" DROP CONSTRAINT "sale_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sale_voids" DROP CONSTRAINT "sale_voids_sale_id_sales_id_fk";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT "sales_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" DROP CONSTRAINT "payment_allocation_reversals_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_allocations" DROP CONSTRAINT "payment_allocations_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "payment_reversals" DROP CONSTRAINT "payment_reversals_payment_id_payments_id_fk";
--> statement-breakpoint
ALTER TABLE "payments" DROP CONSTRAINT "payments_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_account_balances" DROP CONSTRAINT "customer_account_balances_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_account_entries" DROP CONSTRAINT "customer_account_entries_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_account_entries" DROP CONSTRAINT "supplier_account_entries_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_lines" DROP CONSTRAINT "purchase_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_voids" DROP CONSTRAINT "purchase_voids_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "purchases" DROP CONSTRAINT "purchases_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_order_lines" DROP CONSTRAINT "customer_order_lines_customer_order_id_customer_orders_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_order_lines" DROP CONSTRAINT "customer_order_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "customer_orders" DROP CONSTRAINT "customer_orders_customer_id_customers_id_fk";
--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" DROP CONSTRAINT "supply_commitment_lines_supply_commitment_id_supply_commitments_id_fk";
--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" DROP CONSTRAINT "supply_commitment_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" DROP CONSTRAINT "supply_commitment_lines_quality_grade_id_quality_grades_id_fk";
--> statement-breakpoint
ALTER TABLE "supply_commitments" DROP CONSTRAINT "supply_commitments_supplier_id_suppliers_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "inventory_movements" DROP CONSTRAINT "inventory_movements_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" DROP CONSTRAINT "purchase_receipt_lines_receipt_id_purchase_receipts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" DROP CONSTRAINT "purchase_receipt_lines_purchase_line_id_purchase_lines_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines" DROP CONSTRAINT "purchase_receipt_lines_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipt_reversals" DROP CONSTRAINT "purchase_receipt_reversals_receipt_id_purchase_receipts_id_fk";
--> statement-breakpoint
ALTER TABLE "purchase_receipts" DROP CONSTRAINT "purchase_receipts_purchase_id_purchases_id_fk";
--> statement-breakpoint
ALTER TABLE "delivery_lines" DROP CONSTRAINT "delivery_lines_sale_line_fk";
--> statement-breakpoint
ALTER TABLE "document_shares" DROP CONSTRAINT "document_shares_document_id_documents_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_adjustments" DROP CONSTRAINT "cash_adjustments_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_movements" DROP CONSTRAINT "cash_movements_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" DROP CONSTRAINT "cash_transfer_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_transfers" DROP CONSTRAINT "cash_transfers_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "expense_reversals" DROP CONSTRAINT "expense_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" DROP CONSTRAINT "goods_arrival_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "goods_arrivals" DROP CONSTRAINT "goods_arrivals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" DROP CONSTRAINT "quality_disposition_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_dispositions" DROP CONSTRAINT "quality_dispositions_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_inspection_reversals" DROP CONSTRAINT "quality_inspection_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "quality_inspections" DROP CONSTRAINT "quality_inspections_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cost_observations" DROP CONSTRAINT "cost_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "debt_observations" DROP CONSTRAINT "debt_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "demand_observations" DROP CONSTRAINT "demand_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "reconciliation_observations" DROP CONSTRAINT "reconciliation_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "supplier_observations" DROP CONSTRAINT "supplier_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" DROP CONSTRAINT "supply_commitment_observations_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "workspace_policies" DROP CONSTRAINT "workspace_policies_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "stocktake_counts" DROP CONSTRAINT "stocktake_counts_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "stocktake_sessions" DROP CONSTRAINT "stocktake_sessions_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_statement_match_reversals" DROP CONSTRAINT "cash_statement_match_reversals_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_statement_matches" DROP CONSTRAINT "cash_statement_matches_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "operational_close_reopens" DROP CONSTRAINT "operational_close_reopens_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "operational_closes" DROP CONSTRAINT "operational_closes_command_id_command_receipts_command_id_fk";
--> statement-breakpoint
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_workspace_sale_fk" FOREIGN KEY ("workspace_id","sale_id") REFERENCES "public"."sales"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_workspace_sale_fk" FOREIGN KEY ("workspace_id","sale_id") REFERENCES "public"."sales"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_voids" ADD CONSTRAINT "sale_voids_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocation_reversals" ADD CONSTRAINT "payment_allocation_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_balances" ADD CONSTRAINT "customer_account_balances_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_workspace_customer_fk" FOREIGN KEY ("workspace_id","customer_id") REFERENCES "public"."customers"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_account_entries" ADD CONSTRAINT "customer_account_entries_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_account_entries" ADD CONSTRAINT "supplier_account_entries_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_lines" ADD CONSTRAINT "customer_order_lines_workspace_order_fk" FOREIGN KEY ("workspace_id","customer_order_id") REFERENCES "public"."customer_orders"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_lines" ADD CONSTRAINT "customer_order_lines_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_workspace_commitment_fk" FOREIGN KEY ("workspace_id","supply_commitment_id") REFERENCES "public"."supply_commitments"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_workspace_product_fk" FOREIGN KEY ("workspace_id","product_id") REFERENCES "public"."products"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_lines" ADD CONSTRAINT "supply_commitment_lines_workspace_quality_grade_fk" FOREIGN KEY ("workspace_id","quality_grade_id") REFERENCES "public"."quality_grades"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_lines" ADD CONSTRAINT "delivery_lines_workspace_sale_line_fk" FOREIGN KEY ("workspace_id","sale_line_id") REFERENCES "public"."sale_lines"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_shares" ADD CONSTRAINT "document_shares_workspace_document_fk" FOREIGN KEY ("workspace_id","document_id") REFERENCES "public"."documents"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_adjustments" ADD CONSTRAINT "cash_adjustments_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfer_reversals" ADD CONSTRAINT "cash_transfer_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_reversals" ADD CONSTRAINT "expense_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrival_reversals" ADD CONSTRAINT "goods_arrival_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goods_arrivals" ADD CONSTRAINT "goods_arrivals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_disposition_reversals" ADD CONSTRAINT "quality_disposition_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_dispositions" ADD CONSTRAINT "quality_dispositions_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspection_reversals" ADD CONSTRAINT "quality_inspection_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_inspections" ADD CONSTRAINT "quality_inspections_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_observations" ADD CONSTRAINT "cost_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_observations" ADD CONSTRAINT "debt_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "demand_observations" ADD CONSTRAINT "demand_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_observations" ADD CONSTRAINT "reconciliation_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_observations" ADD CONSTRAINT "supplier_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supply_commitment_observations" ADD CONSTRAINT "supply_commitment_observations_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_policies" ADD CONSTRAINT "workspace_policies_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_counts" ADD CONSTRAINT "stocktake_counts_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_sessions" ADD CONSTRAINT "stocktake_sessions_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_match_reversals" ADD CONSTRAINT "cash_statement_match_reversals_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_statement_matches" ADD CONSTRAINT "cash_statement_matches_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_close_reopens" ADD CONSTRAINT "operational_close_reopens_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operational_closes" ADD CONSTRAINT "operational_closes_workspace_command_fk" FOREIGN KEY ("workspace_id","command_id") REFERENCES "public"."command_receipts"("workspace_id","command_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
