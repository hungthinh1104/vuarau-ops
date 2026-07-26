# Product brief

**vuarau-ops** is an operational decision system for wholesale vegetable depots (vựa rau)
in Vietnam.

It is not an ERP, not an accounting package, and not a warehouse management system.
Those products ask the user to model their business before they can record a sale.
A depot cannot do that at 4 a.m. with a truck waiting.

## Who uses it

| User                         | Context                                                  | What they need                                                                |
| ---------------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Depot owner (chủ vựa), 40–60 | Knows every customer by name and roughly what each owes  | Trustworthy debt totals, the ability to undo a mistake without losing history |
| Worker (nhân viên), any age  | Standing at a scale, phone in one hand, on 4G that drops | Entry in seconds, no lost writes, no duplicate charges after a retry          |

## What the product is for

1. **Capture operational transactions quickly.** Sales and payments get entered
   during or shortly after the event, often from memory, often back-dated.
2. **Preserve trustworthy debt and payment records.** What a customer owes is the
   most contested number in the business. It must be reconstructible, attributable,
   and never quietly edited.
3. **Recover safely from mistakes.** Workers mistype. Customers dispute. The fix is
   always a compensating record, never an erasure.
4. **Progressively support better operational decisions.** Later — not now — the
   accumulated ledger answers questions like who pays late and which customer is
   worth extending credit to.

## Why this is hard

- **The network is not reliable.** A submit button tapped twice on a stalled 4G
  connection must not create two debts. Idempotency is a product requirement, not
  a technical nicety.
- **Recorded time ≠ transaction time.** Yesterday's sale entered this morning ages
  from yesterday. One timestamp cannot mean both.
- **Money is contested.** Every ledger movement must name an actor, a command, and
  a cause.
- **Vietnamese units are irregular.** kg, gram, lạng, bó, thùng, rổ, kiện, cái. A bó
  of rau muống has no fixed mass; the system must not pretend otherwise.
- **Đồng amounts are large and must be exact.** Floating point is disqualified.

## What "good" looks like

- A worker records a sale in under ten seconds and never thinks about sync.
- An owner can point at any number in a debt total and see which sale or payment
  produced it, who entered it, and when.
- A mistake is corrected in one action that leaves both the error and the fix
  visible.

## Current phase — workflow validation

The vertical slice is **implemented end to end**, backend and frontend
foundation. What has not been tested is whether it helps anybody.

### What exists

```
Authentication → Customer → Sale draft → Posted sale → Customer account entry
              → Payment → Payment reversal → Sale void → Audit history
```

Twelve commands and ten queries, all implemented and tested against PostgreSQL:

| Commands                                                                             | Queries                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `CreateCustomer` · `UpdateCustomer` · `DeactivateCustomer`                           | `session.me`                                              |
| `CreateSaleDraft` · `UpdateSaleDraft` · `DiscardSaleDraft` · `PostSale` · `VoidSale` | `customer.search` · `customer.get`                        |
| `RecordCustomerPayment` · `ReverseCustomerPayment`                                   | `sale.get` · `sale.list`                                  |
| `AdjustCustomerDebt`                                                                 | `payment.get` · `payment.list`                            |
| `RevokeWorkspaceMembership`                                                          | `account.balance` · `account.timeline` · `audit.timeline` |

Every use case in the [catalog](../02-use-cases/use-case-catalog.md) is
implemented; no P0 rule is planned. The full surface is in
[command-contracts.md](../06-api-contracts/command-contracts.md) and
[read-models.md](../06-api-contracts/read-models.md).

### What is complete, and what that does not mean

**The frontend foundation is complete.** `apps/web` is a working Next application
with a design system built from `design.md`, a typed tRPC client, and a Storybook
covering every state in the
[UI state catalog](../06-api-contracts/ui-state-catalog.md).

**The production workflows are not.** A design system is not a product. Nobody has
recorded a real sale in this software, and every claim in "What good looks like"
above — ten seconds, no lost writes, a correction anybody can follow — is an
intention rather than a measurement.

That gap is the whole of the current phase.

## The two hypotheses under test

```text
H1 — frontend commands integrate safely with the real backend
H2 — a worker can record a real multi-line sale faster than the current
     paper/memory process
```

**H1 is testable by us.** It asks whether idempotency, capabilities, version
conflicts and the unknown-network path behave against a real server and a real
database, rather than against fixtures. Automated tests can settle it, and
[validation-plan.md](validation-plan.md) says which ones.

**H2 is not.** It asks whether a depot worker, on their own phone, at their own
pace, beats the notebook they already trust. No test in this repository can answer
that, and no green suite should be reported as if it had. It is settled by watching
15–20 real transactions, which is what the pilot worksheet in
[validation-plan.md](validation-plan.md) is for.

The order matters. Putting an unsafe workflow in front of a depot would produce
feedback about the wrong thing — and if it duplicated a receivable, it would cost
somebody real money to find out.

See [scope.md](scope.md) for what remains deliberately excluded.

## Related

- Scope: [scope.md](scope.md)
- Glossary: [../01-domain/glossary.md](../01-domain/glossary.md)
- Ledger design: [../07-data/ledger-model.md](../07-data/ledger-model.md)
- Open policy questions: [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
