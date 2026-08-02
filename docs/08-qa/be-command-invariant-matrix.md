# Backend command idempotency and concurrency matrix

This matrix records the command-level proof required before changing a
money/goods workflow. A successful response alone is insufficient: source facts,
ledger/movement effects and the command receipt must remain singular.

| Command family | Same intent retry | Different payload under same key | Stale/concurrent mutation | PostgreSQL evidence |
| --- | --- | --- | --- | --- |
| Sale post / void | `sale.app.test.ts`, `void-sale.app.test.ts`, `sale-correction.db.test.ts` | `command-pipeline.app.test.ts` | `full-slice.db.test.ts`, `lifecycle.app.test.ts` | source sale/void, ledger and receipt counts |
| Customer payment / reversal | `payment.app.test.ts`, `command-pipeline.app.test.ts` | `command-pipeline.app.test.ts` | payment version tests | cashbook and account DB tests |
| Supplier payment / Purchase confirm | `supplier.app.test.ts`, `full-depot-day.app.test.ts` | shared command pipeline tests | supplier/Purchase lifecycle tests | `goods-truth.db.test.ts`, `supplier-account.db.test.ts` |
| Intake disposition / reversal | `intake.app.test.ts`, operations restore tests | shared command pipeline schema/identity checks | downstream-first reversal tests | `intake.db.test.ts` |
| Delivery dispatch / return | `delivery.app.test.ts`, depot DB tests | shared command pipeline checks | competing dispatch test | `depot-operations.db.test.ts` |
| Cash expense / transfer / payment | `cash.app.test.ts` | shared command pipeline checks | concurrent payment retry regression | `cashbook.db.test.ts` — TC-CASH-010 |
| Inventory adjustment / reclassification | inventory application tests | shared command pipeline checks | expected-version and movement constraints | `goods-truth.db.test.ts` |
| Backup restore | operations application tests | command identity/replay tests | atomic rollback and replay | `operations-restore.db.test.ts` |

The PostgreSQL suite is run against a disposable migrated database. Existing
application/contract coverage remains necessary because it proves authorization,
error mapping and state-machine decisions before the SQL adapter is exercised.
