-- The remaining lifecycle commands: customer update and deactivation, sale draft
-- edit and discard, membership revocation.
--
-- Hand-written for the same reason 0004 was: drizzle-kit cannot add a value to an
-- existing enum without being told it is not a new type. Every statement is an
-- ADD — no column is dropped, no data is rewritten.
--
-- Use cases: UC-CUSTOMER-004, UC-CUSTOMER-005, UC-SALE-001, UC-AUTH-002.
-- Rules: BR-CUSTOMER-003, BR-CUSTOMER-004, BR-SALE-018, BR-AUTH-007.

-- ---------------------------------------------------------------------------
-- 1. `discarded` — a third stored sale status
-- ---------------------------------------------------------------------------
-- A lifecycle value, not a deletion. The draft row stays, because "somebody
-- entered this and then thought better of it" is information, and because a
-- discarded draft resubmitted by an offline client has to be recognised as a
-- replay rather than accepted as new (BR-SALE-018, BR-COMMAND-001).
ALTER TYPE "public"."sale_status" ADD VALUE 'discarded' AFTER 'posted';--> statement-breakpoint

ALTER TABLE "sales" ADD COLUMN "discarded_at" timestamp with time zone;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Audit vocabulary
-- ---------------------------------------------------------------------------
-- Membership is now an audited aggregate: revoking access is an action somebody
-- took, and the audit trail has to keep working after they leave — which is when
-- it is most needed.
ALTER TYPE "public"."audit_aggregate_type" ADD VALUE 'membership' AFTER 'debt';--> statement-breakpoint

ALTER TYPE "public"."audit_action" ADD VALUE 'customer.updated' AFTER 'customer.created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'customer.deactivated' AFTER 'customer.updated';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'sale.draft_edited' AFTER 'sale.draft_created';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'sale.discarded' AFTER 'sale.draft_edited';--> statement-breakpoint
ALTER TYPE "public"."audit_action" ADD VALUE 'membership.revoked' AFTER 'debt.adjusted';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 3. Rejection codes
-- ---------------------------------------------------------------------------
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_VERSION_CONFLICT' AFTER 'CUSTOMER_NAME_REQUIRED';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'CUSTOMER_ALREADY_INACTIVE' AFTER 'CUSTOMER_VERSION_CONFLICT';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'SALE_ALREADY_DISCARDED' AFTER 'SALE_IMMUTABLE';--> statement-breakpoint
ALTER TYPE "public"."domain_rejection_code" ADD VALUE 'WORKSPACE_LAST_OWNER' AFTER 'PERMISSION_DENIED';--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 4. The immutability trigger, restated for the new status
-- ---------------------------------------------------------------------------
-- `sales_posted_immutable` fires on `OLD.status = 'posted'` and is unchanged — a
-- posted sale is still unreachable by UPDATE (BR-SALE-008).
--
-- A **discarded** draft gets the same treatment. Editing one would resurrect a
-- decision somebody made, and the domain already refuses with
-- SALE_ALREADY_DISCARDED; this is the layer that holds when the domain is
-- bypassed, exactly as `sales_posted_immutable` is for a posted sale.
DROP TRIGGER IF EXISTS sales_posted_immutable ON sales;--> statement-breakpoint

-- `OLD.status::text`, not `OLD.status IN (...)`. Postgres refuses to *use* an
-- enum value added in the same transaction ("new enum values must be committed
-- before they can be used"), and comparing as text sidesteps that without
-- splitting this into two migrations for one predicate.
CREATE TRIGGER sales_terminal_immutable
  BEFORE UPDATE ON sales
  FOR EACH ROW WHEN (OLD.status::text IN ('posted', 'discarded'))
  EXECUTE FUNCTION vuarau_forbid_posted_sale_change();--> statement-breakpoint

-- `sale_lines_posted_immutable` blocked **every** update to a line, which was
-- right when the only writer was PostSale. `UpdateSaleDraft` replaces a draft's
-- lines, so the guard moves to the lines of a sale that is no longer a draft.
DROP TRIGGER IF EXISTS sale_lines_posted_immutable ON sale_lines;--> statement-breakpoint

CREATE OR REPLACE FUNCTION vuarau_forbid_terminal_sale_line_change() RETURNS trigger AS $$
DECLARE
  sale_status text;
BEGIN
  SELECT status::text INTO sale_status FROM sales WHERE id = OLD.sale_id;
  IF sale_status IN ('posted', 'discarded') THEN
    RAISE EXCEPTION
      '% on the lines of a % sale is forbidden: a posted sale is immutable. Void it and post a replacement instead.',
      TG_OP, sale_status
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint

CREATE TRIGGER sale_lines_terminal_immutable
  BEFORE UPDATE OR DELETE ON sale_lines
  FOR EACH ROW EXECUTE FUNCTION vuarau_forbid_terminal_sale_line_change();--> statement-breakpoint

-- `sale_lines_no_delete` blocked every delete, and editing a draft replaces its
-- line set. The new trigger above covers the case that actually mattered: the
-- lines of a sale that is no longer a draft.
DROP TRIGGER IF EXISTS sale_lines_no_delete ON sale_lines;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 5. Read support for the draft list
-- ---------------------------------------------------------------------------
-- `sales_workspace_status_time_idx` already covers filtering by status; a
-- discarded draft is found through it like any other. No new index.
--
-- Deliberately absent: an index on `customers.is_active`. Search filters on it
-- optionally, and a depot's customer list is small enough that the existing
-- `customers_workspace_name_idx` is the one that matters.
SELECT 1;
