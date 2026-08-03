# Backend goods truth and recovery matrix

Goods Truth is derived from source-linked movements, not from a mutable balance.
Recovery must recreate canonical facts and rebuild projections without inventing
new business events.

| Workflow                    | Canonical rule                                                                      | PostgreSQL evidence                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Direct receipt              | receipt quantity creates one Product/grade/unit inbound movement                    | `goods-truth.db.test.ts` — split-grade receipt, retry and over-receipt guard                            |
| Inspected intake            | Arrival → Inspection → Disposition; only accepted allocation creates sellable stock | `intake.db.test.ts` — recursive quarantine disposition, inventory reconciliation and append-only guards |
| Dispatch                    | physical fulfilment cannot exceed Sale quantity under concurrency                   | `depot-operations.db.test.ts` — competing dispatches                                                    |
| Customer return             | explicit return creates a positive compensating movement without changing debt      | `depot-operations.db.test.ts` and `read-models.db.test.ts`                                              |
| Adjustment/reclassification | signed movement or conserving grade pair; source facts remain immutable             | `goods-truth.db.test.ts`                                                                                |
| Projection integrity        | canonical movement sum equals projected Product/grade/unit balance                  | `goods-truth.db.test.ts`, `intake.db.test.ts`, `depot-operations.db.test.ts`                            |
| Backup/restore              | source history restores atomically, projections rebuild, replay adds no rows        | `operations-restore.db.test.ts` — restore, rollback, tampered snapshot and replay                       |

Supplier claims/credits, cross-dimension Purchase/Sale corrections and partial
return financial semantics remain explicit policy gates; this matrix does not
silently treat a generic adjustment as one of those workflows.
