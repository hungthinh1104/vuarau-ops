# Sale state machine

```
                    CreateSaleDraft
                          │
                          ▼
                     ┌─────────┐   EditSaleDraft (planned)
                     │  draft  │◀──────────┐
                     └────┬────┘───────────┘
                          │
          DiscardSaleDraft│  PostSale
            (planned)     │  ├── version must match      (BR-SALE-006)
                ┌─────────┴──┤  ├── ≥ 1 valid line       (BR-SALE-002)
                ▼            ▼  └── +total, one entry    (BR-SALE-007)
         ┌───────────┐   ┌──────────┐
         │ discarded │   │  posted  │  ── immutable ──   (BR-SALE-008)
         └───────────┘   └────┬─────┘
            terminal          │  terminal (stored lifecycle ends here)
                              │
                              │  VoidSale  ── appends beside, never edits
                              ▼
                       ┌──────────────┐
                       │ sale_voids   │  one row, UNIQUE (sale_id)
                       │  + −total    │  compensating account entry
                       └──────────────┘
                              │
                    sale reads as `voided`  (derived, BR-SALE-013)
```

## The two dimensions

The stored lifecycle has **two** values, `draft` and `posted`, and stops. Anything
that happens to a sale after posting is recorded next to it:

| Question                    | Answered by                             | Stored? |
| --------------------------- | --------------------------------------- | ------- |
| Where is this sale in entry | `sales.status`                          | yes     |
| Does the receivable stand   | presence of a `sale_voids` row          | no      |
| Was a term agreed, is it up | `sales.due_at` versus the reading clock | partly  |

Keeping these apart is the point. A single `status` column carrying
`draft | posted | voided | overdue` would mix a data-entry stage, a financial fact,
and a time-dependent judgement into one value, and every read would have to know
which of the three it meant. Status enums rot exactly this way.

## Why there is no `cancelled`

`cancelled` used to cover both "throw away this half-typed draft" and "undo this
completed sale". Those differ in the only way that matters here: the first moves no
money and the second moves all of it. One word for both meant the ledger effect of
a cancel depended on where it started, which is how a balance ends up wrong with
nobody able to say when.

They are now two commands with two names, two permissions, and two audit actions
(ASM-005, closed).

## Why posting is terminal

A posted sale is a historical claim: on this date, this customer took this load at
this price. Editing it would rewrite what a customer is being asked to pay for,
after the fact, with no record that it changed — the exact failure this system
exists to prevent.

So the correction path adds rather than edits (ADR-0004, extended by ADR-0012):

1. `VoidSale` — one immutable void record, one compensating entry of `−total`.
   Net effect on the balance: zero.
2. Optionally, a new sale carrying `replacesSaleId`, posted normally.

After the two, the account shows `+wrong`, `−wrong`, `+right`. All three entries
stand, the arithmetic is right, and the history explains itself. Compare the old
path — one `AdjustCustomerDebt` — which produced the right balance beside a sale
document that still said the wrong thing (BR-ACCOUNT-010).

## Guards, in the order they run

`PostSale`:

1. permission `sale.post` (BR-AUTH-004)
2. sale exists in this workspace (`SALE_NOT_FOUND`)
3. version matches (`SALE_VERSION_CONFLICT`, BR-SALE-006) — **before** status,
   because "someone else changed this" is the more useful of the two answers
4. status is `draft` (`SALE_ALREADY_POSTED`, BR-SALE-005)
5. at least one line (`SALE_EMPTY`, BR-SALE-002)
6. every line valid, currencies consistent (`SALE_LINE_INVALID`,
   `SALE_CURRENCY_MISMATCH`)

`VoidSale`:

1. permission `sale.void` (BR-AUTH-004)
2. sale exists in this workspace (`SALE_NOT_FOUND`)
3. status is `posted` (`SALE_NOT_POSTED`, BR-SALE-015) — a draft is discarded, not
   voided
4. no existing void record (`SALE_ALREADY_VOIDED`, BR-SALE-013)
5. reason code and non-blank explanation (`SALE_VOID_REASON_REQUIRED`,
   BR-SALE-014)

## Related

- [state-catalog.md](state-catalog.md), [transition-catalog.md](transition-catalog.md)
- [../04-business-rules/sale-rules.md](../04-business-rules/sale-rules.md)
- [../02-use-cases/UC-SALE-002-post-sale.md](../02-use-cases/UC-SALE-002-post-sale.md), [../02-use-cases/sale-use-cases.md](../02-use-cases/sale-use-cases.md)
