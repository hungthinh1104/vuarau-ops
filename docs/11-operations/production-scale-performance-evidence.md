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
| Product Coverage read model    |     250 ms |
| Operations Board page          |     100 ms |
| Receiving progress page        |     100 ms |
| Dashboard summary/series       |     250 ms |
| Debt-aging source aggregate    |     250 ms |
| Supplier reconciliation        |      75 ms |

They leave most of a 500 ms interactive server budget for authorization,
transaction setup, mapping and network latency. They are release gates, not
vendor-independent promises.

## Dataset and method

`pnpm perf:production-scale` creates one isolated workspace. The canonical
release command runs it against the separate database supplied through
`RELEASE_PERF_DATABASE_URL`; it must never share the functional test/E2E
database:

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
the production-scale canonical tables fails the command. Canonical aggregate
families (coverage, dashboard, debt-aging sources and board counts) are allowed
to scan their source population; page/timeline families are not. The output
names the family, p95, plan time, buffer hits/reads and scan policy so a later
optimization can be compared against the same evidence contract.

## Evidence — 2026-08-11, PostgreSQL 17 local container

Exact release SHA: `1bd46beb5dea5af737b91a38d6200d7442a3b85f`.

| Query                   | Measured p95 | EXPLAIN execution | Sequential scan         |
| ----------------------- | -----------: | ----------------: | ----------------------- |
| customer timeline       |      0.69 ms |          0.442 ms | no                      |
| supplier timeline       |      0.62 ms |          0.645 ms | no                      |
| inventory movements     |      0.49 ms |          0.619 ms | no                      |
| delivery fulfilment     |      0.56 ms |          0.084 ms | no                      |
| operational report page |      0.62 ms |          0.708 ms | no                      |
| customer report total   |     19.45 ms |        453.443 ms | explained               |
| inventory report total  |     34.59 ms |        574.680 ms | explained               |
| document read           |      0.31 ms |          0.054 ms | no                      |
| idempotency replay      |      0.26 ms |          0.048 ms | no                      |
| customer reconciliation |      0.31 ms |          0.216 ms | no                      |
| product coverage        |     28.84 ms |        327.957 ms | explained               |
| operations board page   |      0.53 ms |          0.653 ms | no                      |
| operations board counts |     12.52 ms |        306.672 ms | explained               |
| receiving progress      |      0.63 ms |          0.175 ms | allowed empty-side scan |
| dashboard summary       |     17.70 ms |        653.106 ms | explained               |
| dashboard series        |     43.77 ms |        628.960 ms | explained               |
| debt-aging sources      |     53.61 ms |        681.234 ms | explained               |
| supplier reconciliation |      9.69 ms |        303.087 ms | explained               |

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
