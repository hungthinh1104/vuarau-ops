-- Append-only and no-hard-delete guards.
--
-- The application already has no code path that updates or deletes these rows:
-- no repository method exists and no Drizzle call does it. These triggers exist
-- for the paths the application does not control — a migration written in haste,
-- a hand-typed psql statement at 2 a.m., an ORM upgrade that changes what an
-- upsert means. Money tables should refuse, not rely on everyone remembering.
--
-- Rules: BR-DEBT-005, BR-ORDER-008, BR-PAYMENT-005.
-- Docs: docs/07-data/data-model.md, docs/07-data/ledger-model.md

CREATE OR REPLACE FUNCTION vuanha_forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    '% on % is forbidden: this table is append-only. Append a compensating record instead.',
    TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION vuanha_forbid_delete() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION
    'DELETE on % is forbidden: finalized records are never removed.',
    TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint

-- Fully immutable: nothing about these rows may ever change.
CREATE TRIGGER debt_ledger_entries_append_only
  BEFORE UPDATE OR DELETE ON debt_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_mutation();
--> statement-breakpoint

CREATE TRIGGER payment_reversals_append_only
  BEFORE UPDATE OR DELETE ON payment_reversals
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_mutation();
--> statement-breakpoint

CREATE TRIGGER audit_logs_append_only
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_mutation();
--> statement-breakpoint

-- Delete-only guards. These tables have a small number of legitimately mutable
-- columns — an order's status and version, a payment's reversed amount — so a
-- blanket UPDATE ban would block the domain itself. Removal is still forbidden.
CREATE TRIGGER payments_no_delete
  BEFORE DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_delete();
--> statement-breakpoint

CREATE TRIGGER orders_no_delete
  BEFORE DELETE ON orders
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_delete();
--> statement-breakpoint

CREATE TRIGGER order_lines_no_delete
  BEFORE DELETE ON order_lines
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_delete();
--> statement-breakpoint

-- `command_receipts` is deliberately NOT guarded. Receipts are operational data
-- with a retention question still open (ASM-014); pruning old ones must stay
-- possible without dropping a trigger first.
