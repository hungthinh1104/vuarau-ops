# Backend financial truth matrix

Financial balances are derived from canonical append-only facts. The evidence
below checks the equation at the database boundary, not only through a DTO.

| Truth | Canonical equation | Evidence |
| --- | --- | --- |
| Customer debt | sum of customer account entries | `full-slice.db.test.ts` — sale, payment, void, rebuild and source-corruption refusal |
| Supplier payable | sum of supplier account entries | `supplier-account.db.test.ts` and `goods-truth.db.test.ts` — payment, reversal, adjustment, concurrent projection deltas |
| Cash balance | sum of cash movements per account | `cashbook.db.test.ts` — payment movement, source linkage, reconciliation and concurrent retry |
| Sale correction | original entry plus exactly one void compensation and optional replacement | `sale-correction.db.test.ts`, `full-slice.db.test.ts` |
| Payment reversal | original payment effect plus exact partial/full inverse | `payment.app.test.ts`, `full-slice.db.test.ts` |
| Recovery | rebuild equals canonical source sum; source corruption fails closed | `full-slice.db.test.ts`, `operations-restore.db.test.ts`, `read-models.db.test.ts` |

Cash remains separate from debt: a customer payment creates one negative customer
ledger entry and one positive cash movement in the same transaction. Expenses and
transfers affect cash without changing customer or supplier balances.
