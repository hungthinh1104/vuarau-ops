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
4. **Trace inbound goods independently from money.** Supplier payable, Purchase
   confirmation and physical Receiving remain separate, source-linked facts.
5. **Progressively support better operational decisions.** Later — not now — the
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

## Current phase — pilot gate

The vertical slice is **implemented end to end**, backend and browser. What has
not been tested is whether it helps anybody, and the current phase is about
getting a real worker in front of it without overstating what that will prove.

### What exists

```
Authentication → Customer → Sale draft → Posted sale → Customer account entry
              → Payment → Payment reversal → Sale void → Audit history
```

The command/query surface is implemented and tested against PostgreSQL. The
canonical inventory is maintained in the use-case catalog and typed router rather
than duplicated as a count here.

| Commands                                                                             | Queries                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `CreateCustomer` · `UpdateCustomer` · `DeactivateCustomer` · `ReactivateCustomer`    | `session.me` · `session.workspaces` · `session.workspace` |
| `CreateSaleDraft` · `UpdateSaleDraft` · `DiscardSaleDraft` · `PostSale` · `VoidSale` | `customer.search` · `customer.get`                        |
| `RecordCustomerPayment` · `ReverseCustomerPayment`                                   | `sale.get` · `sale.list`                                  |
| `AdjustCustomerDebt` · `RebuildAccountProjection`                                    | `payment.get` · `payment.list`                            |
| member add/change/revoke/reactivate commands                                         | account balance/timeline/reconciliation/evidence · audit  |

Every use case in the [catalog](../02-use-cases/use-case-catalog.md) is
implemented; no P0 rule is planned. The full surface is in
[command-contracts.md](../06-api-contracts/command-contracts.md) and
[read-models.md](../06-api-contracts/read-models.md).

### What is complete, and what that does not mean

The browser now closes the technical workflows through M21: Quick Sale,
void/replacement correction, payment/reversal, debt adjustment, explainable
account reconciliation, member/role administration, and customer lifecycle.
These flows use the typed API and PostgreSQL in automated end-to-end tests.
Supplier payment, Purchase correction, Receiving/reversal and per-unit inventory
movement, Sale fulfilment/return, immutable operational documents, secure
sharing, and source-backed reports are included.

**Nobody has recorded a real sale in this software.** Every claim in "What good
looks like" above — ten seconds, no lost writes, a correction anybody can follow —
is an intention rather than a measurement, and a passing test suite is not
evidence for any of them.

That gap is the whole of the current phase.

## The two hypotheses under test

```text
H1 — frontend commands integrate safely with the real backend
H2 — a worker records a real multi-line sale accurately, unaided, within the
     target time
```

**H1 is testable by us.** It asks whether idempotency, capabilities, version
conflicts and the unknown-network path behave against a real server and a real
database, rather than against fixtures. Automated tests can settle it, and
[validation-plan.md](validation-plan.md) says which ones.

**H2 is not.** It asks whether a depot worker, on their own phone, at their own
pace, gets the right sale into the system without help and inside the time it
should take. No test in this repository can answer that, and no green suite should
be reported as if it had. It is settled by watching 15–20 real transactions, which
is what [pilot-worksheet.md](pilot-worksheet.md) is for.

H2 previously read _"faster than the current paper/memory process"_. That is a
comparison, and the pilot never measured the process it compared against — so the
claim was a size larger than any evidence it could produce. The worker's own
recording is still observed, and it now does the job it is actually good for:
it is the **reference copy of what was sold**, against which the recorded sale is
checked for accuracy. [Why in full](validation-plan.md).

The order matters. Putting an unsafe workflow in front of a depot would produce
feedback about the wrong thing — and if it duplicated a receivable, it would cost
somebody real money to find out.

See [scope.md](scope.md) for the current delivered boundary and
[roadmap.md](roadmap.md) for the product direction.

## Related

- Scope: [scope.md](scope.md)
- Roadmap: [roadmap.md](roadmap.md)
- Glossary: [../01-domain/glossary.md](../01-domain/glossary.md)
- Ledger design: [../07-data/ledger-model.md](../07-data/ledger-model.md)
- Open policy questions: [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
