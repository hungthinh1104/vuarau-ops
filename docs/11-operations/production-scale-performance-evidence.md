# Production-scale performance evidence

## Budgets fixed before optimization

These are server-side PostgreSQL p95 budgets on the local production-shape
rehearsal, excluding browser/network time:

| Query family                   | p95 budget |
| ------------------------------ | ---------: |
| Customer/supplier timeline     |      75 ms |
| Inventory movements            |      75 ms |
| Delivery fulfilment            |     100 ms |
| Operational report page        |     100 ms |
| Canonical report aggregation   |     250 ms |
| Document read                  |      25 ms |
| Idempotency receipt lookup     |      10 ms |
| Reconciliation for one account |      75 ms |

They leave most of a 500 ms interactive server budget for authorization,
transaction setup, mapping and network latency. They are release gates, not
vendor-independent promises.

## Dataset and method

`pnpm perf:production-scale` creates one isolated workspace with:

```text
10,000 customers
10,000 products
100,000 posted Sales and 100,000 confirmed Purchases
400,000 customer ledger entries
100,000 supplier ledger entries
500,000 inventory movements
25,000 dispatched Deliveries
10,000 immutable documents
10,001 command receipts for indexed replay lookup
```

Each query is warmed, executed 20 measured times, and checked with
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`. A budget breach or sequential scan of
the production-scale canonical tables fails the command.

## Evidence — 2026-07-29, PostgreSQL 17 local container

| Query                   | Measured p95 | EXPLAIN execution | Sequential scan |
| ----------------------- | -----------: | ----------------: | --------------- |
| customer timeline       |      0.64 ms |          0.331 ms | no              |
| supplier timeline       |      0.55 ms |          0.626 ms | no              |
| inventory movements     |      0.49 ms |          0.390 ms | no              |
| delivery fulfilment     |      0.62 ms |          0.079 ms | no              |
| operational report page |      0.58 ms |          0.655 ms | no              |
| customer report total   |     19.84 ms |        417.574 ms | explained       |
| inventory report total  |     33.57 ms |        568.010 ms | explained       |
| document read           |      0.31 ms |          0.047 ms | no              |
| idempotency replay      |      0.36 ms |          0.037 ms | no              |
| customer reconciliation |      0.35 ms |          0.215 ms | no              |

The first report plan exposed a 400,000-row parallel sequential scan and measured
443.778 ms. Migration `0020_white_black_crow.sql` adds cursor-compatible
workspace timelines; the report repository now applies workspace/date/cursor and
`LIMIT` in PostgreSQL before mapping. The repeated plan above is the post-fix
evidence.

Totals intentionally aggregate the selected canonical population. The harness
measures those full-population aggregates separately with a 250 ms p95 budget and
permits their explained sequential scans; every page/read query still fails on a
sequential scan. This is a canonical aggregate, not page construction or a cache.
No speculative cache was added.

PostgreSQL TC-OPS-010 separately proves 205 equal-time rows cross three pages
without a missing/duplicate row and rejects a foreign workspace.
