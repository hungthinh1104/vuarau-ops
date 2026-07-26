-- Read-side support: diacritic folding for customer search, and the indexes the
-- new paged queries actually use.
--
-- No table or column changes, so drizzle-kit's schema snapshot is unchanged.
-- Everything here is an index or a function — additive, reversible by dropping
-- it, and invisible to the domain.
--
-- Use cases: UC-CUSTOMER-002, UC-SALE-003, UC-PAYMENT-003, UC-ACCOUNT-001,
-- UC-AUDIT-001.

-- ---------------------------------------------------------------------------
-- 1. Diacritic folding
-- ---------------------------------------------------------------------------
-- A worker at a loading bay types "co hoa" on a phone keyboard and has to find
-- "Cô Hoà" (UC-CUSTOMER-002).
--
-- `unaccent` would be the obvious choice and is not used: it is an extension —
-- one more thing to install on every environment — it is not IMMUTABLE without a
-- wrapper, and it leaves `đ`/`Đ` alone, a letter Vietnamese names are full of.
-- `translate` needs nothing installed, is IMMUTABLE, and handles đ correctly.
--
-- The mapping is Vietnamese-specific on purpose. This is a system for Vietnamese
-- depots, and a fold that is right for Vietnamese beats one that is approximately
-- right for every language.
CREATE OR REPLACE FUNCTION vuarau_fold(input text) RETURNS text AS $$
  SELECT lower(translate(
    input,
    'ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴÝỶỸ' ||
    'àáâãèéêìíòóôõùúăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵýỷỹ',
    'AAAAEEEIIOOOOUUADIUOUAAAAAAAAAAAAEEEEEEEEIIOOOOOOOOOOOOUUUUUUUYYYYY' ||
    'aaaaeeeiioooouuadiuouaaaaaaaaaaaaeeeeeeeeiioooooooooooouuuuuuuyyyyy'
  ));
$$ LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- 2. Indexes for the queries that exist
-- ---------------------------------------------------------------------------
-- Only these. An index no query uses costs every write and pays back nothing,
-- and guessing at future ones would be guessing.
--
-- Each is (filter columns, then the keyset sort key), because keyset paging
-- compares `(sort, id)` as a row value and can walk exactly this order rather
-- than sorting a result set afterwards.

-- UC-CUSTOMER-002 — `ORDER BY display_name, id` within a workspace.
CREATE INDEX IF NOT EXISTS "customers_workspace_name_idx"
  ON "customers" ("workspace_id", "display_name", "id");--> statement-breakpoint

-- UC-SALE-003 — the day view, newest business time first. The existing
-- `sales_workspace_customer_time_idx` already covers the per-customer filter;
-- this covers the unfiltered list, which is the screen a depot opens first.
CREATE INDEX IF NOT EXISTS "sales_workspace_time_id_idx"
  ON "sales" ("workspace_id", "transaction_time" DESC, "id" DESC);--> statement-breakpoint

-- UC-PAYMENT-003 — the same shape for the day's takings. `payments` had no
-- time-ordered index at all, so every list would have sorted the whole workspace.
CREATE INDEX IF NOT EXISTS "payments_workspace_time_id_idx"
  ON "payments" ("workspace_id", "transaction_time" DESC, "id" DESC);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "payments_workspace_customer_time_idx"
  ON "payments" ("workspace_id", "customer_id", "transaction_time" DESC, "id" DESC);--> statement-breakpoint

-- UC-ACCOUNT-001 — the timeline page and the window function that computes the
-- running balance both read the customer's entries in exactly this order.
CREATE INDEX IF NOT EXISTS "customer_account_entries_timeline_idx"
  ON "customer_account_entries" ("workspace_id", "customer_id", "transaction_time" DESC, "id" DESC);--> statement-breakpoint

-- UC-ACCOUNT-001 — the timeline resolves each entry's source through LEFT JOINs
-- on `source_id`. The targets are reached by primary key; this is the side that
-- was not already covered.
CREATE INDEX IF NOT EXISTS "customer_account_entries_source_id_idx"
  ON "customer_account_entries" ("source_id");--> statement-breakpoint

-- UC-AUDIT-001 — ordered by *recording* time, not business time: an audit trail
-- answers "in what order did this system learn things", and a back-dated entry
-- belongs where it was written down.
CREATE INDEX IF NOT EXISTS "audit_logs_workspace_recorded_idx"
  ON "audit_logs" ("workspace_id", "recorded_at" DESC, "id" DESC);--> statement-breakpoint

-- UC-AUDIT-001 — "what happened to this sale", which is how the correction story
-- is read.
CREATE INDEX IF NOT EXISTS "audit_logs_aggregate_idx"
  ON "audit_logs" ("workspace_id", "aggregate_type", "aggregate_id", "recorded_at" DESC);
