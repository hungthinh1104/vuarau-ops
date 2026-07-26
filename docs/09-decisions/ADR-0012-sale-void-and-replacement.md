# ADR-0012 — Correct a posted sale by voiding it, not by adjusting the balance

**Status:** accepted · 2026-07-26

## Context

A posted sale is immutable (BR-SALE-008) and a customer account entry is
append-only ([ADR-0004](ADR-0004-append-only-debt-ledger.md)). Both are settled.
Neither says what to do when a posted sale turns out to be **wrong** — the wrong
quantity, the wrong price, the wrong customer, or goods that came back on the
truck. In a depot this happens most days.

The bootstrap answered with `AdjustCustomerDebt`: append a compensating entry with
a free-text reason. The balance came out right. The sale document still said the
wrong thing.

That is the actual problem. A depot owner opening the sale sees 875.000 ₫; the
account says the customer owes 625.000 ₫; the only thing connecting them is a
sentence somebody typed. Two records of one event, disagreeing, with no structured
link — and it was recorded as ASM-010 rather than solved.

## Decision

1. **`VoidSale`** is the correction path for a posted sale. It writes one immutable
   `sale_voids` row and one compensating account entry of exactly `−total`
   (BR-SALE-012).
2. The compensation is computed from the **stored** posted total. The caller sends
   no amount, so a void cannot move an arbitrary sum.
3. Voiding is **all or nothing**. There is no partial void.
4. A void requires a `reasonCode` from a fixed list **and** free-text explanation
   (BR-SALE-014).
5. A **replacement** is an ordinary new sale carrying `replacesSaleId`. It is
   optional, and the link is set once at draft creation.
6. The original sale and its posting entry are never touched. The sale's
   `financialState` (`active` / `voided`) is **derived** from whether a void record
   exists — not stored.
7. `AdjustCustomerDebt` survives, narrowed: opening balances, write-offs, dispute
   settlements, migration corrections. Correcting a sale is explicitly not on the
   list (BR-ACCOUNT-010).
8. `VoidSale` needs `sale.void`, held by `owner` and `accountant` — not by `sales`,
   who may post.

## Alternatives considered

| Alternative                                    | Why not                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Keep `AdjustCustomerDebt`** (the status quo) | The document and the balance disagree, and only free text explains why. It also gives one command the power to move any balance by any amount for any reason — the operation we most want narrowed, used for the case that occurs most often.                                               |
| **Edit the posted sale**                       | Rewrites what a customer is being asked to pay for, after the fact, with no record that it changed. This is the failure the whole system exists to prevent, and it would break BR-SALE-008 and the append-only trigger.                                                                     |
| **A `voided` column on `sales`**               | Requires updating a row promised to be immutable, and creates a second place the truth lives. Deriving it from `sale_voids` makes "a voided sale nets to zero" true by construction: the void record and the compensating entry commit together.                                            |
| **Partial void** (void 250.000 of 875.000)     | Creates a third notion of what the sale was for, alongside the posted total and any replacement, with none authoritative. It also reintroduces the arbitrary-amount problem the stored-total rule removes. A wrong sale is voided whole and replaced.                                       |
| **`AmendSale`** — supersede with a new version | Tempting, and it was the original ASM-010 sketch. It needs a version chain on an immutable aggregate, a rule for which version the account entry belongs to, and an answer for what "the sale" means in a report. Void + replacement expresses the same thing with two existing mechanisms. |
| **Require a replacement for every void**       | Invents a sale that never happened. A load that comes back is voided and never replaced (CASE-SALE-008).                                                                                                                                                                                    |
| **Let the void carry an arbitrary amount**     | That is `AdjustCustomerDebt` wearing a sale's clothes, and it would let `accountant` move any balance under a name that sounds procedural.                                                                                                                                                  |

## Consequences

**Good.** The document and the balance agree. The correction names which sale was
wrong, why, and who decided — structured, not free text. Nothing is updated or
deleted, so the append-only guarantees extend to sale correction unchanged. The
account timeline reads `+wrong`, `−wrong`, `+right`, which is followable
arithmetic. `AdjustCustomerDebt` becomes rarer, and rarer means more suspicious,
which is what you want from the sharpest command in the system.

**Bad.** Correcting a sale is now two commands rather than one, and a worker who
only wants to fix a price has to void and re-enter. That is a real cost in typing,
paid deliberately: the alternative is a system where the fastest way to fix a
mistake is also the way to hide one.

Three entries appear where a naive reader expects one. The account timeline must
show all three — hiding the pair would make the arithmetic unexplainable
([UI state catalog](../06-api-contracts/ui-state-catalog.md)).

Following the replacement chain forwards is a scan of `replaces_sale_id`; only
backwards is a single lookup. Reads are the cheap direction to improve later.

**Not solved.** Voiding a sale the customer already paid leaves a
`customer_credit` balance and no refund mechanism — correctly, because refunding
cash is a decision the depot makes outside this system (CASE-SALE-011). Whether a
large void needs a second approver is ASM-020.

## Revisit when

- A depot needs partial correction of a sale often enough that void-and-replace
  becomes a real burden — at which point `AmendSale` deserves reconsidering with
  evidence rather than as a guess.
- Returns become a modelled concept, at which point `goods_returned` moves out of
  the void reason codes and into its own aggregate.
- Refunds need to be recorded in this system rather than settled outside it.

## Related

- [ADR-0004-append-only-debt-ledger.md](ADR-0004-append-only-debt-ledger.md)
- [ADR-0013-sale-not-order.md](ADR-0013-sale-not-order.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md)
