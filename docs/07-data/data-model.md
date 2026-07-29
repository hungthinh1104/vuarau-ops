# Data model

Schema in code: `packages/db/src/schema/`. Migration: `packages/db/migrations/`.

Only the tables the first vertical slice needs. No table exists here for a module
that has not been built.

## Tables

| Table                       | Purpose                                                                   | Mutability                                |
| --------------------------- | ------------------------------------------------------------------------- | ----------------------------------------- |
| `workspaces`                | One depot = one tenant                                                    | mutable master data                       |
| `actors`                    | Users who issue commands; `supabase_user_id` links a verified JWT subject | mutable master data                       |
| `workspace_memberships`     | Which actor may act in which workspace                                    | mutable                                   |
| `customers`                 | Buyers                                                                    | mutable master data                       |
| `products`                  | Catalogue for sale lines                                                  | mutable master data                       |
| `sales`                     | Completed sales, `draft` → `posted`                                       | status/version only, until posted         |
| `sale_lines`                | Lines of a sale, with price snapshots                                     | replaced while `draft`                    |
| `payments`                  | Money received                                                            | `reversed_amount`/`status`/`version` only |
| `payment_reversals`         | Compensating records                                                      | **append-only**                           |
| `customer_account_entries`  | Source of truth for debt                                                  | **append-only**                           |
| `customer_account_balances` | Rebuildable projection                                                    | recomputable                              |
| `command_receipts`          | Idempotency records                                                       | insert + one status update                |
| `audit_logs`                | Business action history                                                   | **append-only**                           |
| `suppliers`, `purchases`    | Supplier master data and immutable confirmed Purchase snapshots           | master/draft mutable; confirmed immutable |
| `supplier_account_entries`  | Source of truth for supplier payable                                      | **append-only**                           |
| `purchase_receipts`         | Physical inbound source documents and explicit reversals                  | **append-only**                           |
| `inventory_movements`       | Canonical per-Product/unit physical ledger                                | **append-only**                           |
| `inventory_balances`        | Rebuildable per-Product/unit projection                                   | recomputable                              |
| `deliveries`                | Sale-linked physical fulfilment lifecycle                                 | draft/status/version only                 |
| `delivery_returns`          | Explicit physical return compensations                                    | **append-only**                           |
| `documents`                 | Immutable versioned source snapshots and deterministic digests            | **append-only**                           |
| `document_shares`           | Hashed public capability tokens with expiry/revocation                    | revocation fields only                    |

## Conventions applied to every table

1. **Workspace isolation.** Every business table has `workspace_id NOT NULL` with a
   foreign key. Every repository method takes it as a required parameter, so a
   query cannot forget the filter. P0 (BR-CUSTOMER-002).
2. **Integer money.** `bigint` columns holding minor units, plus an explicit
   `currency` column beside every amount. Never `numeric`, never `float`.
3. **Explicit time.** `transaction_time` and `recorded_at` on every business event
   row; `created_at`/`updated_at` only where they mean something.
4. **Versions.** `sales`, `payments`, `customers` carry `version integer NOT NULL`
   for optimistic concurrency.
5. **No hard delete of finalized records.** Enforced by triggers, not convention.

## Append-only enforcement

`packages/db/migrations/` installs a trigger function on
`customer_account_entries`, `payment_reversals`, and `audit_logs`:

```sql
CREATE TRIGGER … BEFORE UPDATE OR DELETE ON customer_account_entries
  FOR EACH ROW EXECUTE FUNCTION vuanha_forbid_mutation();
```

and a delete-only guard on `sales`, `sale_lines`, and `payments`.

The application already has no code path that updates or deletes these rows. The
trigger is there for the paths the application does not control: a migration
written in haste, a hand-typed `psql` statement at 2 a.m., an ORM upgrade that
changes an upsert's meaning. Money tables should refuse, not rely on everyone
remembering.

`payments.reversed_amount`, `payments.status`, and `payments.version` are the only
mutable columns on a financial row, which is why `payments` gets the delete-only
guard rather than the full one.

## Keys, uniqueness, and indexes

| Constraint                                                 | Table                       | Why                                                                                                         |
| ---------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `UNIQUE (workspace_id, idempotency_key)`                   | `command_receipts`          | The mechanism behind BR-COMMAND-001 — two concurrent replays cannot both proceed                            |
| `UNIQUE (command_id)`                                      | `command_receipts`          | Detects `DUPLICATE_COMMAND`                                                                                 |
| `UNIQUE (supabase_user_id)`                                | `actors`                    | One verified subject resolves to exactly one actor (BR-AUTH-005)                                            |
| `UNIQUE (source_type, source_id)`                          | `customer_account_entries`  | A second entry for the same sale posting or payment is impossible at the storage layer, not merely unlikely |
| `PRIMARY KEY (workspace_id, customer_id)`                  | `customer_account_balances` | One row per customer per workspace                                                                          |
| `INDEX (workspace_id, customer_id, transaction_time DESC)` | `customer_account_entries`  | The customer debt-history screen, and every aging query                                                     |
| `INDEX (workspace_id, status, transaction_time DESC)`      | `sales`                     | "Today's sales", "unposted drafts"                                                                          |
| `INDEX (workspace_id, customer_id, transaction_time DESC)` | `payments`                  | Customer payment history                                                                                    |

The `UNIQUE (source_type, source_id)` constraint deserves emphasis: it means the
"post twice creates two receivables" bug is not merely tested against — it is
unrepresentable.

## What is deliberately absent

- No `customers.balance` column. Debt lives in the ledger ([ADR-0004](../09-decisions/ADR-0004-append-only-debt-ledger.md)).
- No `sales.paid` / `sales.payment_status`. Payments are not allocated (ASM-004).
- No `deleted_at` on financial tables. Nothing is deleted.
- No tax-invoice, inventory-valuation, allocation, routing, forecasting, or AI
  tables. M20 documents are operational snapshots and make no tax claim.
- No row-level security yet — isolation is enforced in the application layer
  (ASM-009). Milestone 1 added authentication and role-based authorization above
  it; RLS remains the defence in depth that is still missing.
- `actors.supabase_user_id` is `text`, not `uuid`: a JWT `sub` is a string by
  specification, and typing the column to what Supabase happens to emit today
  would reject any other issuer tomorrow.

## Related

- [ledger-model.md](ledger-model.md), [time-semantics.md](time-semantics.md)
- [../03-state-machines/state-catalog.md](../03-state-machines/state-catalog.md)
