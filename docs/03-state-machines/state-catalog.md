# State catalog

Every versioned aggregate lifecycle and every persisted or derived condition that
behaves like state. Adding a value requires updating this catalog, the
[transition catalog](transition-catalog.md), contracts, rules and tests.

## Versioned aggregates

Each aggregate starts at version 1 and increments by one for every successful
command that changes its mutable state.

| Aggregate       | Stored lifecycle                                | Mutable transitions                                 | Terminal boundary   |
| --------------- | ----------------------------------------------- | --------------------------------------------------- | ------------------- |
| Customer        | active/inactive from `isActive`                 | update, deactivate, reactivate                      | none                |
| Product         | active/inactive from `isActive`                 | update, deactivate, reactivate                      | none                |
| QualityGrade    | active/inactive from `isActive`                 | update, deactivate, reactivate                      | none                |
| Supplier        | active/inactive from `isActive`                 | update, deactivate, reactivate                      | none                |
| Sale            | `draft`, `posted`, `discarded`                  | update draft, post, discard                         | posted/discarded    |
| Payment         | `recorded`, `partially_reversed`, `reversed`    | reverse remaining amount                            | reversed            |
| SupplierPayment | `recorded`, `partially_reversed`, `reversed`    | reverse remaining amount                            | reversed            |
| Purchase        | `draft`, `confirmed`, `discarded`               | update draft, confirm, discard                      | confirmed/discarded |
| Delivery        | `draft`, `cancelled`, `dispatched`, `delivered` | update/cancel draft, dispatch, acknowledge delivery | cancelled/delivered |

Document `version` is an immutable sequence number per source document, not an
optimistic-concurrency lifecycle. Memberships, voids, receipt reversals, returns,
adjustments, account entries and inventory movements are immutable or adjacent
facts rather than versioned aggregates.

## Stored lifecycle details

### Sale

| Value       | Meaning                              | Direct effect                       |
| ----------- | ------------------------------------ | ----------------------------------- |
| `draft`     | Editable commercial proposal         | none                                |
| `posted`    | Immutable agreed Sale                | one customer account entry `+total` |
| `discarded` | Abandoned draft retained for history | none                                |

### Customer and supplier Payment

Both use the same lifecycle, recomputed from canonical `amount` and
`reversedAmount` on each write:

| Value                | Derivation                                     |
| -------------------- | ---------------------------------------------- |
| `recorded`           | reversed amount is zero                        |
| `partially_reversed` | reversed amount is above zero and below amount |
| `reversed`           | reversed amount equals amount                  |

### Purchase

| Value       | Meaning                              | Direct effect                       |
| ----------- | ------------------------------------ | ----------------------------------- |
| `draft`     | Editable commercial proposal         | none                                |
| `confirmed` | Immutable agreed Purchase            | one supplier account entry `+total` |
| `discarded` | Abandoned draft retained for history | none                                |

### Delivery

| Value        | Meaning                                                  | Direct effect                  |
| ------------ | -------------------------------------------------------- | ------------------------------ |
| `draft`      | Editable fulfilment proposal for a posted, non-void Sale | none                           |
| `cancelled`  | Abandoned before dispatch                                | none                           |
| `dispatched` | Goods left inventory                                     | one negative movement per line |
| `delivered`  | Completion acknowledged                                  | none beyond dispatch           |

Returns are immutable adjacent facts with positive movements; they do not rewrite
Delivery, Sale, or customer money.

## Derived business states

These are read-time views of canonical facts, never independent truth.

| State family               | Values or condition                                                                | Canonical derivation                                                                |
| -------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Sale financial             | `active`, `voided`                                                                 | posted Sale plus absence/presence of `sale_voids`                                   |
| Sale due                   | `no_due_date`, `due`, `overdue`                                                    | nullable `dueAt` compared with the reading clock                                    |
| Purchase financial         | active/voided condition                                                            | confirmed Purchase plus absence/presence of `purchase_voids`; no public stored enum |
| Purchase receiving         | remaining/complete quantities per line                                             | Purchase line quantity minus active Receipts plus reversals; no stored status       |
| Receipt                    | active/reversed condition                                                          | Receipt plus absence/presence of its immutable reversal; no stored status           |
| Delivery fulfilment        | `unfulfilled`, `partially_fulfilled`, `fulfilled`, `returned_partial`, `attention` | ordered Sale line minus exact-grade dispatch plus return facts                      |
| Document share             | available, expired or revoked condition                                            | token digest, `expiresAt` and `revokedAt`; no stored public-read status             |
| Customer balance           | `receivable`, `settled`, `customer_credit`                                         | sign of canonical customer account sum                                              |
| Supplier balance           | `payable`, `settled`, `supplier_credit`                                            | sign of canonical supplier account sum                                              |
| Inventory                  | `positive`, `zero`, `negative`                                                     | sign of canonical Product/QualityGrade/unit movement sum                            |
| Customer reconciliation    | `consistent`, `inconsistent`, `not_found`, `integrity_failure`                     | canonical customer ledger versus projection and source integrity                    |
| Supplier reconciliation    | `consistent`, `inconsistent`, `not_found`, `integrity_failure`                     | canonical supplier ledger versus projection and source integrity                    |
| Inventory reconciliation   | `consistent`, `inconsistent`, `not_found`, `integrity_failure`                     | canonical movements versus projection and source integrity                          |
| Workspace/report integrity | `healthy`, `attention`                                                             | source, projection, reference and digest checks                                     |

Negative customer, supplier or inventory values are retained facts with explicit
classifications. They are not silently clamped or rejected.

## Internal persisted state

`command_receipts` use `in_progress` and `completed` to coordinate idempotent
execution. This is infrastructure recovery state, not a business aggregate
lifecycle. Offline queue state is client-only; the server sees either an
uncommitted command or one atomic committed receipt and result.

## Values that are not states

| Tempting value                      | Why it is not a state                                             |
| ----------------------------------- | ----------------------------------------------------------------- |
| paid/unpaid Sale                    | Payments are not allocated to Sales; customer balance is separate |
| delivered/returned Sale             | Delivery and Return are physical facts, not Sale lifecycle        |
| received Purchase                   | Receipts are physical facts, not Purchase lifecycle               |
| voided Sale/Purchase column         | Void is an immutable adjacent record and compensating effect      |
| has-debt Customer                   | Derived from canonical account entries                            |
| synced/pending-upload server status | Offline queue state belongs to the client                         |
| report total                        | A disposable view that must resolve to canonical sources          |

## Cross-context boundary

Commercial, financial and physical state remain separate dimensions. A transition
may cross dimensions only when its named rule declares the effect. See
[product-invariants.md](../00-product/product-invariants.md).

## Related

- [transition-catalog.md](transition-catalog.md)
- [sale-state-machine.md](sale-state-machine.md)
- [payment-state-machine.md](payment-state-machine.md)
- [purchase-state-machine.md](purchase-state-machine.md)
