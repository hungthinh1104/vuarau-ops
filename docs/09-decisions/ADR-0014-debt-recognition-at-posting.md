# ADR-0014 — The receivable arises at posting

**Status:** accepted · 2026-07-27 · **unconfirmed by a depot owner** — see
[ASM-002-debt-recognition-worksheet.md](ASM-002-debt-recognition-worksheet.md)

"Accepted" here means the system behaves this way, the rule exists, and a test
holds it. It does not mean a depot owner has said it is right. That confirmation
is ASM-023, it is owed before the first real sale is recorded, and this line stays
until the worksheet comes back signed.

## Context

ASM-002 — _does the receivable arise at posting, delivery, or invoicing?_ — has
been carried since the bootstrap as **deferred with trigger**, the trigger being
"before the first depot records real sales". Milestone 5.5 puts a real worker in
front of the software, so the trigger has fired. A deferred entry at its own
trigger is no longer a deferral; it is a guess with a calendar.

The question is the least reversible one in the backlog, for a mechanical reason.
The ledger is append-only (ADR-0004): entries are never updated and never deleted.
Every posting writes a `customer_account_entries` row whose `transactionTime` is
the moment the depot says the sale happened. If the receivable should really arise
somewhere else, that column is wrong on every row already written, and the only
honest repair — rewriting immutable rows — is the thing the design exists to
forbid.

Three candidate moments, and what each would mean here:

| Moment        | Modelled today?                                                               | What the depot would be saying            |
| ------------- | ----------------------------------------------------------------------------- | ----------------------------------------- |
| **Posting**   | Yes — `PostSale` is the only command that writes a positive entry from a sale | "Chốt đơn and you owe me"                 |
| **Delivery**  | No. There is no delivery event, command, table or source type                 | "You owe me when the load leaves my yard" |
| **Invoicing** | No. There is no invoice, no numbering, no tax treatment                       | "You owe me when I write it up"           |

Two of the three are not near-misses; they do not exist. Choosing either is a
milestone with its own aggregate, command, permission and ledger source type — not
a configuration flag.

There is also a vocabulary argument, and it is the strongest one available without
a depot owner in the room. A sale in this system is defined as a **completed
transaction**: goods handed over, quantity weighed, price agreed
([ADR-0013](ADR-0013-sale-not-order.md)). If that definition is accurate, then
posting _is_ delivery — the goods went with the buyer, and there is no later
moment to recognise. `PostSale` is not a clerical step that follows the trade; it
is the trade being written down.

What makes this worth an ADR rather than a shrug is that the definition might be
wrong for a particular depot. If a depot's chốt đơn is an agreement in the evening
for a load that goes out the next morning, then this system is modelling an order
and calling it a sale, and the receivable is a day early every time.

## Decision

**A customer's receivable arises when a sale is posted, and at no other event.**

Concretely, and enforced rather than described:

1. `PostSale` is the only command that writes a `sale_posting` account entry
   (BR-SALE-007). Draft creation, draft edit and draft discard write none
   (BR-SALE-010).
2. The entry's `transactionTime` is `command.occurredAt` — when the depot says the
   sale happened, which may be hours or days before it was typed
   ([ADR-0007](ADR-0007-explicit-transaction-and-recorded-time.md)). `recordedAt`
   is the second, separate column.
3. `ACCOUNT_ENTRY_SOURCE_TYPES` is a closed enum containing no delivery and no
   invoice source. A receivable cannot be created by any event this system does
   not model, because there is no value to record it under.
4. The policy is stated as **BR-SALE-020**, risk P0, held by **TC-SALE-028** and
   illustrated by **CASE-SALE-013**. It is not left implicit inside BR-SALE-007,
   which counts entries rather than placing them in time.
5. ASM-002 moves from _deferred with trigger_ to **decided**. The owner
   confirmation becomes **ASM-023**, an operational action with a named owner and
   a deadline, because it is somebody going and asking a question — not a design
   question still open.

**No stored behaviour changes.** This is deliberate: the milestone brief says not
to change debt recognition without an explicit documented decision, and the
explicit documented decision is that what the software already does is correct. A
decision that ratifies the status quo is still a decision; what changes is that it
is now argued, tested and named, rather than being the default nobody had revisited.

## Alternatives considered

| Alternative                                               | Why not                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Leave ASM-002 deferred until after the pilot**          | The trigger is "before the first depot records real sales", and the pilot is that. Deferring past your own trigger is how an assumption becomes permanent — nobody ever revisits it at a _less_ convenient moment.                                                                                                |
| **Recognise at delivery**                                 | There is no delivery event to recognise at. Building one — `RecordDelivery`, a `delivery_note` source type, a partial-delivery rule, a permission — is a milestone, and it would be built on a guess about a depot nobody has watched work. Scope excludes delivery for exactly this reason.                      |
| **Recognise at invoicing**                                | Depots of this size do not issue invoices; the notebook page _is_ the document. Inventing one to hang the receivable on would add a document, a numbering scheme and a lifecycle to answer a question nobody asked.                                                                                               |
| **Make the recognition point configurable per workspace** | Two ledgers with different meanings behind one API, and a `workspace.debtRecognition` column that changes what historical rows meant when somebody flips it. A policy engine for a policy with one known value, before the one known value has been confirmed by anybody.                                         |
| **Record entries at posting but mark them provisional**   | A provisional receivable is a balance a depot cannot act on, which makes the balance useless for the one thing it is for. It also needs a second event to un-provision it — which is the delivery event, unbuilt, arriving through the back door.                                                                 |
| **Ask the depot owner first, decide after**               | Correct in principle and impossible in sequence: the pilot workspace has to exist before there is a session in which to ask, and the software has to behave _somehow_ while the question is out. This ADR is that "somehow", stated out loud with its confirmation tracked as ASM-023 rather than left to memory. |

## Consequences

**Good.** The most dangerous assumption in the backlog now has a rule, a case and
a test, and any future change to it fails a named P0 test rather than passing
quietly. The four questions that would falsify it are written down, so the pilot
session collects the evidence instead of the facilitator remembering to ask.

**Good.** `PostSale` and "chốt đơn" now mean the same thing on purpose rather than
by coincidence, which is what the pilot's comprehension questions actually test.

**Bad, and unfixable if we are wrong.** Every `sale_posting` entry recorded before
a contrary answer carries a `transactionTime` that is too early. Those rows are
immutable. The escape hatch is that `ACCOUNT_ENTRY_SOURCE_TYPES` is an enum — a
`delivery_note` source can be added and posting entries stopped — but the history
stays wrong, and a depot reconciling it would have to be told which date range to
distrust. This is why ASM-023 has a deadline and not a hope.

**Bad.** "Accepted, unconfirmed" is an unusual ADR status and somebody will read
only the first word. The confirmation line is placed above the Context section for
that reason, and the worksheet's sign-off block is the single place that removes
it.

**Mixed.** Because nothing changes in the code, this ADR is easy to mistake for
paperwork. It is the opposite: it converts a silent default into a claim somebody
can be wrong about, which is the only form a decision can take that a test can
hold.

## Revisit when

- The worksheet comes back with anything other than "từ lúc chốt đơn" — which
  stops the pilot before real sales rather than after.
- A depot describes chốt đơn as covering a stretch of the morning rather than a
  moment, making "when the sale happened" a range the model cannot express.
- A `CustomerOrder` aggregate is built ([ADR-0013](ADR-0013-sale-not-order.md)),
  at which point there are two events and the receivable has to be attached to
  exactly one of them, explicitly.
- Any depot begins issuing documents to customers, making "invoicing" a real
  moment rather than a borrowed word.

## Related

- [ASM-002-debt-recognition-worksheet.md](ASM-002-debt-recognition-worksheet.md) — the four questions
- [ADR-0004-append-only-debt-ledger.md](ADR-0004-append-only-debt-ledger.md) — why this cannot be corrected later
- [ADR-0007-explicit-transaction-and-recorded-time.md](ADR-0007-explicit-transaction-and-recorded-time.md) — which timestamp carries the recognition
- [ADR-0013-sale-not-order.md](ADR-0013-sale-not-order.md) — the definition this rests on
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md) — BR-SALE-020
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md) — CASE-SALE-013
- [decision-backlog.md](decision-backlog.md) — ASM-002, ASM-023
