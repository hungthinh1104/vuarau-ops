# Task template

Copy, fill in, and hand to the implementer. An unfilled section is an unanswered
question, not a formality — see
[CHANGE_PROTOCOL.md](CHANGE_PROTOCOL.md).

---

## Goal

<One sentence, in the depot's terms. "Refuse a payment that would make the balance
negative" — not "add a validation to recordPayment".>

## Risk classification

**P0 / P1 / P2 / P3** — justification: <what breaks if this is wrong>

## Related IDs

| Kind           | IDs                     |
| -------------- | ----------------------- |
| Use case       | UC-…                    |
| Business rules | BR-…                    |
| Cases          | CASE-…                  |
| Tests          | TC-… (existing and new) |
| Decisions      | ADR-…, ASM-…            |

## Files to read first

- `docs/04-business-rules/…`
- `docs/05-casebook/…`
- `packages/domain-kernel/src/…`

## Files allowed to change

- `packages/domain-kernel/src/…`
- `packages/domain-contracts/src/…`
- `apps/api/src/modules/…`
- `docs/04-business-rules/…`
- `docs/08-qa/trace-map.yml`

## Files forbidden to change

- `packages/db/migrations/**` — applied migrations are immutable; add a new one
- Any module not named above
- Any existing test, unless the task is explicitly to change a rule

## Expected tests

| ID   | Project                              | Asserts |
| ---- | ------------------------------------ | ------- |
| TC-… | domain / application / contract / db |         |

**Write them first and confirm they fail for the right reason.**

## Unresolved policy

<Does this depend on anything in the decision backlog? If yes, name the ASM and
either get an answer or state the smallest reversible default being assumed.>

## Definition of done

- [ ] Failing test written first and observed failing for the expected reason
- [ ] Minimum implementation added
- [ ] `pnpm verify` passes
- [ ] Rule documented with a stable ID and risk class
- [ ] Trace map updated
- [ ] No boundary violation
- [ ] No unrelated files changed
- [ ] New assumptions recorded as `ASM-*`

## Out of scope for this task

<Named explicitly, so scope creep is visible.>

---

## Worked example

### Goal

Refuse a `RecordCustomerPayment` that would drive the customer's balance below
zero, and return a stable code the UI can act on.

### Risk classification

**P0** — changes what the ledger will accept. Getting it wrong either rejects real
money received or permits a balance the depot has decided is impossible.

### Related IDs

| Kind           | IDs                                                                          |
| -------------- | ---------------------------------------------------------------------------- |
| Use case       | UC-PAYMENT-001                                                               |
| Business rules | BR-ACCOUNT-007 (to be deprecated), BR-ACCOUNT-009 (new)                      |
| Cases          | CASE-PAYMENT-003                                                             |
| Tests          | TC-PAYMENT-011 (inverted), TC-ACCOUNT-007 (deprecated), TC-PAYMENT-012 (new) |
| Decisions      | **ASM-001 must be closed first**                                             |

### Unresolved policy

Blocked on ASM-001. The depot owner must confirm that prepaid credit is not a
thing before this task starts. Implementing it while ASM-001 is open would bake a
guess into the ledger.

### Files allowed to change

`packages/domain-kernel/src/payment/record-payment.ts`,
`packages/domain-contracts/src/shared/rejection-codes.ts`,
`docs/04-business-rules/customer-account-rules.md`, `docs/04-business-rules/error-code-catalog.md`,
`docs/08-qa/trace-map.yml`, the three tests above.

### Out of scope

Retro-fixing balances that are already negative — that is a separate data task
needing its own decision.
