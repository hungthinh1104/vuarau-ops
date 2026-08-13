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
| Operations Board page          |     150 ms |
| Operations Board counts        |     250 ms |
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
to scan their source population. Operations Board ordering is itself derived
from the latest canonical fact, so its production page is also measured as a
bounded canonical aggregate: it applies keyset `LIMIT` after deriving the
order, rather than pretending that a stale base-row timestamp is a page index.
The output names the family, p95, plan time, buffer hits/reads and scan policy
so a later optimization can be compared against the same evidence contract.

## Evidence — 2026-08-14, PostgreSQL 17 local container

Exact rehearsal SHA: `0856647d3db7ff67919d3dc5d83de77bb2c573ac`.

| Query                   | Measured p95 | EXPLAIN execution | Sequential scan |
| ----------------------- | -----------: | ----------------: | --------------- |
| customer timeline       |      0.69 ms |          0.320 ms | no              |
| supplier timeline       |      0.59 ms |          0.637 ms | no              |
| inventory movements     |      0.58 ms |          0.807 ms | no              |
| delivery fulfilment     |      0.61 ms |          0.101 ms | no              |
| operational report page |      0.69 ms |          0.690 ms | no              |
| customer report total   |     17.99 ms |        419.965 ms | explained       |
| inventory report total  |     31.85 ms |        561.809 ms | explained       |
| document read           |      0.33 ms |          0.071 ms | no              |
| idempotency replay      |      0.28 ms |          0.038 ms | no              |
| customer reconciliation |      0.29 ms |          0.214 ms | no              |
| product coverage        |     16.26 ms |          8.899 ms | explained       |
| operations board page   |    101.07 ms |       2228.363 ms | explained       |
| operations board counts |    184.23 ms |       7416.065 ms | explained       |
| receiving progress      |      0.56 ms |          0.199 ms | no              |
| dashboard summary       |     15.23 ms |        651.738 ms | explained       |
| dashboard series        |     41.15 ms |        622.714 ms | explained       |
| debt-aging sources      |     49.61 ms |        674.766 ms | explained       |
| supplier reconciliation |      7.97 ms |        312.198 ms | explained       |

The Board page returned 25 rows through one repository query; Board counts
returned one scalar row through three concurrent canonical queries. Both stayed
within their strict p95 budgets on the clean schema rehearsal.

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
