# Review checklist

Ordered by what costs most when missed. Stop at the first section that fails.

## 1. Money and debt — P0

- [ ] No `UPDATE` or `DELETE` against `customer_account_entries`, `payment_reversals`,
      or `audit_logs`.
- [ ] No amount is stored or computed as a float. All money is integer minor units.
- [ ] Rounding happens in exactly one place, half-up, on the minor unit
      (BR-SALE-004).
- [ ] A command that moves money produces **exactly one** ledger entry per effect —
      not zero, not two. Check the retry path specifically.
- [ ] Every ledger entry has `actorId`, `commandId`, `transactionTime`,
      `recordedAt` (BR-ACCOUNT-004).
- [ ] Corrections are compensating entries. Nothing is edited or removed.
- [ ] The customer account balance is still equal to the sum of entries after the change
      (BR-ACCOUNT-001).

## 2. Workspace isolation — P0

- [ ] Every new query filters by `workspace_id`. Every new repository method takes
      it as a **required** parameter.
- [ ] No cross-workspace read is possible via a supplied id — the id is not enough,
      the workspace must match.
- [ ] New tables carry `workspace_id NOT NULL` with a foreign key.

## 3. Command discipline

- [ ] The write is a named business command, not a generic update.
- [ ] Envelope complete: `commandId`, `idempotencyKey`, `workspaceId`, `actorId`,
      `occurredAt`.
- [ ] `expectedVersion` present and checked if an existing aggregate is modified.
- [ ] Idempotent replay returns the original result and writes nothing.
- [ ] All effects share one transaction (BR-COMMAND-005).
- [ ] `transactionTime` comes from `occurredAt`; `recordedAt` from the server clock.

## 4. Architecture

- [ ] `domain-kernel` imports nothing from tRPC, Drizzle, Supabase, React, HTTP, or
      `node:*`.
- [ ] Decision functions are deterministic — no clock, no UUID generation, no I/O.
- [ ] `packages/db` does not import `domain-kernel` or `apps/*`.
- [ ] No raw database row is exposed as an API type; DTOs are mapped explicitly.
- [ ] No rule is implemented twice. Capabilities call the same function the handler
      calls.
- [ ] No `utils/`, `helpers/`, `common/`, `misc/`, `types/`, `services/` folder.
- [ ] `pnpm boundary:check` passes.

## 5. State

- [ ] A new lifecycle value is in the state catalog **and** the transition catalog.
- [ ] The new value does not mix a second lifecycle dimension into an existing enum.
- [ ] Derived conditions are derived, not persisted as independently settable
      status.
- [ ] Guards, effects, events, rejection codes, and terminality are all documented.

## 6. Errors and contracts

- [ ] New rejection codes are in the enum **and** the catalog, with a rule and a
      `details` shape.
- [ ] No existing code was renamed or repurposed.
- [ ] `retryable` is correct — in particular, version conflicts are **not**
      retryable.
- [ ] The error carries enough `details` for the UI to be specific.

## 7. Tests

- [ ] The test was written before the implementation and observed failing for the
      expected reason.
- [ ] Test names carry `BR-*` / `TC-*` ids.
- [ ] Every P0 rule touched has a test.
- [ ] Fixed P0/P1 bugs have a regression test.
- [ ] Money assertions use exact integers, no tolerance.
- [ ] No test asserts on private internals or mock call counts.
- [ ] **No test was weakened, skipped, or deleted to make the suite pass.**

## 8. Documentation

- [ ] Rules, cases, and state changes documented with stable IDs.
- [ ] No ID reused; deprecated artefacts marked, not deleted.
- [ ] Trace map updated; `pnpm trace:check` passes.
- [ ] New assumptions in the decision backlog with an `ASM-*` id.
- [ ] Docs claim what the code actually does — the trace check verifies links,
      not truth. **Read the prose against the diff.**

## 9. Scope and maintainability

Apply [ENGINEERING_STANDARD.md](ENGINEERING_STANDARD.md): dependency direction,
canonical business truth, explicit outcomes, pragmatic decomposition, financial
read evidence, and contract-to-test-to-doc completion are review requirements.

- [ ] Nothing from `docs/00-product/scope.md`'s excluded list was implemented.
- [ ] No new dependency without a stated reason and no simpler alternative.
- [ ] No abstraction with a single caller.
- [ ] No unrelated files in the diff.
- [ ] No `TODO` without an owner and a backlog reference.

## The two questions worth asking last

1. **If this is wrong, how would we find out?** If the answer is "a customer
   disputes a balance in three months", the change needs more testing, not more
   review.
2. **Could this have been smaller?** A diff that touches four modules to change one
   rule usually means the rule is in the wrong place.

## Related

- [CHANGE_PROTOCOL.md](CHANGE_PROTOCOL.md)
- [../08-qa/risk-classification.md](../08-qa/risk-classification.md)
