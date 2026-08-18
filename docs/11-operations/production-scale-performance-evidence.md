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

Exact rehearsal SHA: `0603914dba56f4a09bed5f7dfcd892a007e39457`.

| Query                          | Measured p95 | EXPLAIN execution | Sequential scan |
| ------------------------------ | -----------: | ----------------: | --------------- |
| customer timeline              |      0.53 ms |          0.493 ms | no              |
| supplier timeline              |      0.56 ms |          0.687 ms | no              |
| inventory movements            |      0.51 ms |          0.633 ms | no              |
| delivery fulfilment            |      0.57 ms |          0.088 ms | no              |
| operational report page        |      0.57 ms |          0.711 ms | no              |
| customer report total          |     19.00 ms |        423.600 ms | explained       |
| inventory report total         |     36.53 ms |        566.976 ms | explained       |
| document read                  |      0.34 ms |          0.047 ms | no              |
| idempotency replay             |      0.25 ms |          0.048 ms | no              |
| customer reconciliation        |      0.32 ms |          0.209 ms | no              |
| product coverage               |     17.22 ms |         11.005 ms | explained       |
| operations board page          |    104.67 ms |       2228.537 ms | explained       |
| operations board counts        |    199.57 ms |       7115.551 ms | explained       |
| operations board search        |    147.14 ms |       1547.550 ms | explained       |
| operations board filter        |     35.28 ms |        339.245 ms | explained       |
| operations board search counts |    126.53 ms |       1203.178 ms | explained       |
| receiving progress             |      0.56 ms |          0.196 ms | no              |
| dashboard summary              |     18.55 ms |        650.413 ms | explained       |
| dashboard series               |     43.38 ms |        626.196 ms | explained       |
| debt-aging sources             |     52.23 ms |        681.325 ms | explained       |
| supplier reconciliation        |      9.39 ms |        303.263 ms | explained       |

The Board page returned 25 rows through one repository query; Board counts
returned one scalar row through three concurrent canonical queries. Search
returned 10 rows through one repository query, and search counts returned one
scalar row. All Board paths stayed within their strict p95 budgets on the clean
schema rehearsal. Search candidates are narrowed by the canonical Sale/Purchase
reference and counterparty before the physical, financial and activity CTEs are
derived, preserving the same truth while avoiding a full-workspace derivation
for a narrow search.

The first report plan exposed a 400,000-row parallel sequential scan and measured
443.778 ms. Migration `0020_white_black_crow.sql` adds cursor-compatible
workspace timelines; the report repository now applies workspace/date/cursor and
`LIMIT` in PostgreSQL before mapping. The repeated plan above is the post-fix
evidence.

The one-account reconciliation check is a source-truth aggregate rather than a
page read. The scale fixture deliberately assigns 80% of customer ledger rows to
one hot customer, so PostgreSQL may choose a sequential scan for that account;
the release gate still enforces its 75 ms p95 budget. Page and keyset reads keep
the stricter no-sequential-scan policy.

Totals intentionally aggregate the selected canonical population. The harness
measures those full-population aggregates separately with a 250 ms p95 budget and
permits their explained sequential scans; every page/read query still fails on a
sequential scan. This is a canonical aggregate, not page construction or a cache.
No speculative cache was added.

PostgreSQL TC-OPS-010 separately proves 205 equal-time rows cross three pages
without a missing/duplicate row and rejects a foreign workspace.
