CREATE UNIQUE INDEX "products_workspace_id_id_uq"
  ON "products" ("workspace_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_lines_workspace_id_id_uq"
  ON "purchase_lines" ("workspace_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_account_entries_workspace_id_id_uq"
  ON "supplier_account_entries" ("workspace_id", "id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_movements_workspace_id_id_uq"
  ON "inventory_movements" ("workspace_id", "id");--> statement-breakpoint

ALTER TABLE "purchases"
  ADD CONSTRAINT "purchases_workspace_supplier_fk"
  FOREIGN KEY ("workspace_id", "supplier_id")
  REFERENCES "suppliers" ("workspace_id", "id"),
  ADD CONSTRAINT "purchases_workspace_replacement_fk"
  FOREIGN KEY ("workspace_id", "replaces_purchase_id")
  REFERENCES "purchases" ("workspace_id", "id");--> statement-breakpoint
ALTER TABLE "purchase_lines"
  ADD CONSTRAINT "purchase_lines_workspace_purchase_fk"
  FOREIGN KEY ("workspace_id", "purchase_id")
  REFERENCES "purchases" ("workspace_id", "id"),
  ADD CONSTRAINT "purchase_lines_workspace_product_fk"
  FOREIGN KEY ("workspace_id", "product_id")
  REFERENCES "products" ("workspace_id", "id");--> statement-breakpoint
ALTER TABLE "purchase_voids"
  ADD CONSTRAINT "purchase_voids_workspace_purchase_fk"
  FOREIGN KEY ("workspace_id", "purchase_id")
  REFERENCES "purchases" ("workspace_id", "id");--> statement-breakpoint

ALTER TABLE "purchase_receipts"
  ADD CONSTRAINT "purchase_receipts_workspace_purchase_fk"
  FOREIGN KEY ("workspace_id", "purchase_id")
  REFERENCES "purchases" ("workspace_id", "id");--> statement-breakpoint
ALTER TABLE "purchase_receipt_lines"
  ADD CONSTRAINT "purchase_receipt_lines_workspace_receipt_fk"
  FOREIGN KEY ("workspace_id", "receipt_id")
  REFERENCES "purchase_receipts" ("workspace_id", "id"),
  ADD CONSTRAINT "purchase_receipt_lines_workspace_purchase_line_fk"
  FOREIGN KEY ("workspace_id", "purchase_line_id")
  REFERENCES "purchase_lines" ("workspace_id", "id"),
  ADD CONSTRAINT "purchase_receipt_lines_workspace_product_fk"
  FOREIGN KEY ("workspace_id", "product_id")
  REFERENCES "products" ("workspace_id", "id");--> statement-breakpoint
ALTER TABLE "purchase_receipt_reversals"
  ADD CONSTRAINT "purchase_receipt_reversals_workspace_receipt_fk"
  FOREIGN KEY ("workspace_id", "receipt_id")
  REFERENCES "purchase_receipts" ("workspace_id", "id");--> statement-breakpoint

ALTER TABLE "supplier_account_entries"
  ADD CONSTRAINT "supplier_account_entries_workspace_reversal_fk"
  FOREIGN KEY ("workspace_id", "reversal_of_entry_id")
  REFERENCES "supplier_account_entries" ("workspace_id", "id");--> statement-breakpoint
ALTER TABLE "inventory_movements"
  ADD CONSTRAINT "inventory_movements_workspace_product_fk"
  FOREIGN KEY ("workspace_id", "product_id")
  REFERENCES "products" ("workspace_id", "id"),
  ADD CONSTRAINT "inventory_movements_workspace_reversal_fk"
  FOREIGN KEY ("workspace_id", "reversal_of_movement_id")
  REFERENCES "inventory_movements" ("workspace_id", "id");
