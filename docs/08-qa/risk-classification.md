# Risk classification

The class decides how much verification a change owes. It is set by **what breaks
if the change is wrong**, not by how hard the change was.

| Class  | Definition                                                                                     | Examples in this system                                                                                                                             |
| ------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Corruption of money, debt, ledger, or workspace isolation; irreversible data loss              | Duplicate ledger entry on retry; balance ≠ sum of entries; one depot reading another's customers; a deleted payment; wrong rounding in a line total |
| **P1** | A critical workflow is unavailable or materially incorrect, but no financial data is corrupted | Cannot confirm any order; version conflict never detected; a payment reversal accepted without a reason                                             |
| **P2** | Recoverable behaviour or usability problem, no incorrect financial data                        | Unhelpful error message; a capability shown as allowed when the command will refuse it; a slow query                                                |
| **P3** | Cosmetic, documentation, or low-impact reporting                                               | Typo; a stale doc link; a mis-sorted list                                                                                                           |

## Requirements per class

| Requirement                                               | P0           | P1           | P2          | P3       |
| --------------------------------------------------------- | ------------ | ------------ | ----------- | -------- |
| Automated domain test for every rule                      | **required** | required     | optional    | no       |
| Integration or contract test for the command              | **required** | recommended  | optional    | no       |
| Regression test for every fixed bug                       | **required** | **required** | recommended | no       |
| Trace-map entry                                           | **required** | required     | optional    | optional |
| Reviewed against the state catalog if a lifecycle changes | **required** | required     | n/a         | n/a      |

`scripts/trace-check.ts` enforces the first row for P0: a P0 rule with no test
reference fails the build.

## What makes something P0 here

The test is whether a wrong outcome could leave the depot **unable to determine
the truth**:

- A duplicated debt entry is P0 — the customer disputes it and the books cannot
  say who is right.
- A confirm button that fails outright is P1 — annoying, obvious, nothing corrupted.

Loudly broken is better than quietly wrong. That is why a failed command is P1 and
a silently doubled debt is P0.

## Current P0 rules

BR-ORDER-001, BR-ORDER-004, BR-ORDER-006, BR-ORDER-007, BR-ORDER-008,
BR-PAYMENT-001, BR-PAYMENT-002, BR-PAYMENT-003, BR-PAYMENT-005, BR-PAYMENT-007,
BR-DEBT-001, BR-DEBT-002, BR-DEBT-004, BR-DEBT-005, BR-DEBT-006,
BR-CUSTOMER-002,
BR-COMMAND-001, BR-COMMAND-002, BR-COMMAND-003, BR-COMMAND-005,
BR-AUTH-001, BR-AUTH-002, BR-AUTH-003, BR-AUTH-004, BR-AUTH-006.

Twenty-five rules, each with at least one automated test — see
[trace-map.yml](trace-map.yml).

## Related

- [test-strategy.md](test-strategy.md), [traceability.md](traceability.md)
- [../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md)
