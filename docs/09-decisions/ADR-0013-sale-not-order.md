# ADR-0013 — A sale is a completed transaction, not an order

**Status:** accepted · 2026-07-26

## Context

The bootstrap called the central aggregate `Order`, with a lifecycle of
`draft → confirmed → cancelled`. The name was borrowed from e-commerce, where an
order is a **request** that is later fulfilled, may be partially shipped, may be
returned, and has a delivery state.

None of that describes what the aggregate actually models. A depot worker enters
what a buyer **has just taken** — the goods are on the vehicle, the quantity was
weighed, the price was agreed at the counter. The record is a completed
transaction, written down after the fact.

The mismatch was not cosmetic. It produced concrete confusion:

- `confirmed` sounds like accepting a request. It actually means "this trade is
  final and the customer owes for it" — the most financially significant event in
  the system, named after a clerical step.
- `cancelled` covered both discarding a half-typed draft and undoing a completed
  trade, which differ in the only way that matters: the first moves no money and
  the second moves all of it.
- Every conversation about future work had to disambiguate whether "order" meant
  the thing that already happened or the thing a customer might request tomorrow —
  and the second is a genuine future feature.

## Decision

1. The aggregate is a **`Sale`**: a completed transaction. Renamed throughout —
   contracts, kernel, API, persistence, fixtures, tests, and documentation.
2. `CreateOrder` → **`CreateSaleDraft`**. `ConfirmOrder` → **`PostSale`**.
   "Posting" names what happens: the sale is written into the account.
3. The stored lifecycle is **`draft → posted`**, and `posted` is terminal.
   `cancelled` is gone, split into discard (draft, planned) and void (posted,
   [ADR-0012](ADR-0012-sale-void-and-replacement.md)).
4. `PostSale` asserts that **final accepted quantity and agreed price are known**.
   That is the precondition the name carries.
5. The debt ledger becomes the **customer account ledger**; the debt summary
   becomes the **customer account balance**; a negative balance is **customer
   credit**. Tables: `debt_ledger_entries` → `customer_account_entries`,
   `customer_debt_summaries` → `customer_account_balances`.
6. A future **`CustomerOrder`** — a request for goods, with delivery and
   fulfilment — is a separate aggregate. So are returns and inventory. This ADR
   reserves the word.
7. `AdjustCustomerDebt` and the `debt.adjust` / `debt.read` permissions keep their
   names. See below.

## Alternatives considered

| Alternative                                     | Why not                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Keep `Order`, document that it means a sale** | A comment cannot outrun a name. Every new reader, and every future `CustomerOrder`, would re-derive the confusion. The documentation-as-specification rule (ADR-0005) is worth nothing if the code contradicts the vocabulary.                                                 |
| **`Transaction`**                               | Collides with the database term used everywhere in this codebase — `uow.transaction`, `transactionTime`. Two meanings of "transaction" in a system about money is worse than the problem being solved.                                                                         |
| **`Invoice`**                                   | Implies a document issued to a customer, with numbering, tax treatment and accounting consequences. None exists here, and the brief excludes general accounting. It would also imply the receivable arises at invoicing, which is exactly the open question in ASM-002.        |
| **`Delivery` / `DeliveryNote`**                 | Names the logistics event, not the money event, and delivery is explicitly out of scope. It would also pre-empt ASM-002 in the other direction.                                                                                                                                |
| **Compatibility aliases** — `Order = Sale`      | Two names for one concept, forever, in the vocabulary a client is meant to program against. The brief settles it: there is no production data and no client, so clean naming costs nothing today and only gets more expensive.                                                 |
| **Rename `AdjustCustomerDebt` too**             | "Công nợ" is what a depot owner calls the thing, and `debt.adjust` is the permission named in the working agreement and in ADR-0011. The command moves a **debt** specifically — an amount owed with no document behind it. Renaming it would lose that precision to tidiness. |


## Later clarification

M19 introduced Delivery as the physical fulfilment aggregate. Therefore “Sale” no
longer means that every quantity has physically left the depot; it means the
commercial transaction recognized by `PostSale` under ADR-0014/ASM-024. Delivery
records dispatch, completion and return independently. The original decision still
stands in its important negative form: a Sale is not a customer request, picking
list or reservation.

## Consequences

**Good.** The names say what the things are. `PostSale` reads as the money event it
is. The `draft → posted` lifecycle is two values and one of them is terminal, which
is as small as a lifecycle can be while still being useful. "Order" is now free for
the concept that genuinely needs it.

**Bad.** Every identifier moved at once: rule, case and test IDs (`BR-ORDER-*` →
`BR-SALE-*`, `BR-DEBT-*` → `BR-ACCOUNT-*`), rejection codes (`ORDER_EMPTY` →
`SALE_EMPTY`), tables, and enum values. Old identifiers are recorded as retired and
must never be reissued, but every prior commit message and review comment now names
things that no longer exist.

Renaming rejection codes breaks this repository's own rule that a code is never
renamed. That rule protects clients in the field; there are none, and the exception
is argued in full in the
[error code catalog](../04-business-rules/error-code-catalog.md) rather than
glossed over.

Table renames need a migration that is pure DDL and touches no data. Cheap now,
because there is no production data — which is precisely why it is being done now.

**Mixed.** Keeping `AdjustCustomerDebt` and `debt.*` alongside
`customer_account_entries` leaves two vocabularies in one system. That is
deliberate and is the smaller cost: the account is the record, and a debt is one
thing recorded in it. It is listed under retained terminology so nobody "fixes" it
later by accident.

## Revisit when

- `CustomerOrder` is actually built, and the two aggregates need to be told apart
  in the API surface as well as in the model.
- A depot starts issuing documents to customers, at which point `Invoice` becomes a
  real concept rather than a borrowed word.
- ASM-002 is answered and the receivable moves away from posting, which would make
  `PostSale` a slightly less exact name than it is today.

## Related

- [ADR-0012-sale-void-and-replacement.md](ADR-0012-sale-void-and-replacement.md)
- [ADR-0005-markdown-docs-as-source-of-truth.md](ADR-0005-markdown-docs-as-source-of-truth.md)
- [../01-domain/glossary.md](../01-domain/glossary.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
