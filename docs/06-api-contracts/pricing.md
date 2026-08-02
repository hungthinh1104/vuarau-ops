# Pricing contract

The pricing API is a catalogue and resolution surface:

| Procedure         | Access           | Result                                            |
| ----------------- | ---------------- | ------------------------------------------------- |
| `pricing.record`  | `pricing.manage` | One immutable `PriceRuleDto`                      |
| `pricing.list`    | `pricing.read`   | Workspace-scoped effective-date history           |
| `pricing.resolve` | `pricing.read`   | `none`, `selected` or `ambiguous` plus candidates |

`PriceRuleDto` stores the base price, per-unit discount, per-unit fee and the
kernel-computed final price in exact integer minor units. Rule references are
workspace-safe. A resolved price is advisory until a Sale command records the
final agreed price in its line snapshot; the API never rewrites a posted Sale.

The catalogue is persisted in PostgreSQL and mirrored by the in-memory adapter.
Workspace backup V8 includes `priceRules`; V1–V7 backups remain restorable with an
empty pricing collection.

The permission split is a conservative repository default: owner/accountant may
manage rules, operational roles may read them. Depot-owner confirmation of the
commercial precedence, quantity-tier and adjustment policy remains an explicit
field-validation gate.
