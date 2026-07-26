# Manual test template

For behaviour automation cannot reach yet: real network loss, a real phone, a real
worker's hands. Copy this file into a dated session note.

---

## Session

| Field          | Value           |
| -------------- | --------------- |
| Date           | YYYY-MM-DD      |
| Tester         |                 |
| Build / commit |                 |
| Environment    | local / staging |
| Database       |                 |

---

## MT-NNN — <title>

**Related:** UC-… · BR-… · CASE-… · **Risk:** P0 / P1 / P2 / P3

### Preconditions

- Workspace:
- Customer and starting balance:
- Aggregate versions:

### Steps

1.
2.
3.

### Expected

| #   | Expectation | Source |
| --- | ----------- | ------ |
| 1   |             | BR-…   |
| 2   |             | BR-…   |

### Actual

### Ledger check — run for every money-touching test

```sql
SELECT amount_minor, source_type, source_id, transaction_time, recorded_at, actor_id
FROM debt_ledger_entries
WHERE workspace_id = :ws AND customer_id = :cust
ORDER BY transaction_time, recorded_at;

SELECT balance_minor FROM customer_debt_summaries
WHERE workspace_id = :ws AND customer_id = :cust;
```

| Check                                                                                             | Pass |
| ------------------------------------------------------------------------------------------------- | ---- |
| Summary balance = sum of entry amounts (BR-DEBT-001)                                              | ☐    |
| Entry count is what the steps should have produced — no duplicates (BR-ORDER-007, BR-PAYMENT-002) | ☐    |
| Every entry has `actor_id` and `command_id` (BR-DEBT-004)                                         | ☐    |
| No pre-existing entry was modified (BR-DEBT-005)                                                  | ☐    |
| `transaction_time` matches when the event _happened_, not when it was entered (BR-COMMAND-003)    | ☐    |

### Result

☐ Pass ☐ Fail ☐ Blocked

### If failed

- Rejection code returned:
- Expected code:
- **Regression test to add** (required for P0/P1): `TC-…`
- Issue reference:

---

## Scenarios worth testing by hand

Automation cannot reproduce these faithfully.

| ID     | Scenario                                                            | Why manual                                                                |
| ------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| MT-001 | Confirm an order, kill the network mid-request, retry               | Real timing of a real dropped connection (CASE-ORDER-005)                 |
| MT-002 | Double-tap submit on a slow device                                  | Real double-submit timing, not two scripted calls (CASE-PAYMENT-006)      |
| MT-003 | Two phones, same order, both confirm                                | Real user timing against a real database (CASE-ORDER-004)                 |
| MT-004 | Enter yesterday's sale today, check the aging report                | End-to-end time semantics through a UI (CASE-ORDER-006)                   |
| MT-005 | 500 000 ₫ payment, then reverse 200 000 ₫, read the customer screen | Whether a human can _understand_ the resulting history (CASE-PAYMENT-010) |
| MT-006 | Corrupt a summary row by hand, run the rebuild                      | Operational recovery procedure (CASE-DEBT-007)                            |

MT-005 is the one that catches design problems rather than bugs: a technically
correct ledger that a depot owner cannot read is still a failure.

## Related

- [test-strategy.md](test-strategy.md), [risk-classification.md](risk-classification.md)
