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

## Current phase

One vertical slice, backend only:

```
Customer → Sale draft → Posted sale → Customer account entry
        → Payment → Payment reversal → Debt summary → Audit history
```

See [scope.md](scope.md) for what that deliberately excludes.

## Related

- Scope: [scope.md](scope.md)
- Glossary: [../01-domain/glossary.md](../01-domain/glossary.md)
- Ledger design: [../07-data/ledger-model.md](../07-data/ledger-model.md)
- Open policy questions: [../09-decisions/decision-backlog.md](../09-decisions/decision-backlog.md)
