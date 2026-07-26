# Risk classification

The class decides how much verification a change owes. It is set by **what breaks
if the change is wrong**, not by how hard the change was.

| Class  | Definition                                                                                     | Examples in this system                                                                                                                                |
| ------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **P0** | Corruption of money, the account ledger, or workspace isolation; irreversible data loss        | Duplicate account entry on retry; a sale voided twice; balance ≠ sum of entries; one depot reading another's customers; wrong rounding in a line total |
| **P1** | A critical workflow is unavailable or materially incorrect, but no financial data is corrupted | Cannot post any sale; version conflict never detected; a payment reversal or sale void accepted without a reason                                       |
| **P2** | Recoverable behaviour or usability problem, no incorrect financial data                        | Unhelpful error message; a capability shown as allowed when the command will refuse it; a slow query                                                   |
| **P3** | Cosmetic, documentation, or low-impact reporting                                               | Typo; a stale doc link; a mis-sorted list                                                                                                              |

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

- A duplicated account entry is P0 — the customer disputes it and the books cannot
  say who is right.
- A post button that fails outright is P1 — annoying, obvious, nothing corrupted.

Loudly broken is better than quietly wrong. That is why a failed command is P1 and
a silently doubled receivable is P0.

## Why the correction path is P0 throughout

Voiding is the one operation that **removes** money from a customer's balance
without a payment arriving. Every rule that bounds it is therefore P0, even where
the individual failure looks small:

| Rule        | If it were wrong                                                       |
| ----------- | ---------------------------------------------------------------------- |
| BR-SALE-012 | A void that compensates the wrong amount silently changes what is owed |
| BR-SALE-013 | A double void credits a customer twice for one mistake                 |
| BR-SALE-008 | An editable posted sale makes every earlier balance unexplainable      |
| BR-SALE-010 | A draft with a financial effect moves money before anyone agreed       |

BR-SALE-010 is the least obvious of the four and the reason it is written down: a
draft that quietly created an entry would fail silently, and no existing test would
have noticed.

## Current P0 rules

BR-SALE-001, BR-SALE-004, BR-SALE-006, BR-SALE-007, BR-SALE-008, BR-SALE-010,
BR-SALE-011, BR-SALE-012, BR-SALE-013,
BR-PAYMENT-001, BR-PAYMENT-002, BR-PAYMENT-003, BR-PAYMENT-005, BR-PAYMENT-007,
BR-ACCOUNT-001, BR-ACCOUNT-002, BR-ACCOUNT-004, BR-ACCOUNT-005, BR-ACCOUNT-006,
BR-CUSTOMER-002,
BR-COMMAND-001, BR-COMMAND-002, BR-COMMAND-003, BR-COMMAND-005, BR-COMMAND-006,
BR-AUTH-001, BR-AUTH-002, BR-AUTH-003, BR-AUTH-004, BR-AUTH-006.

Thirty rules. **Twenty-five are implemented and carry at least one automated
test.** Five — BR-SALE-010, BR-SALE-011, BR-SALE-012, BR-SALE-013 and
BR-COMMAND-006 — are marked `status: planned` in
[trace-map.yml](trace-map.yml): specified and agreed, not yet built.

A planned P0 rule is **exempt from the test requirement only while it is planned**,
because there is nothing yet for a test to run against. `pnpm trace:check` prints
the planned count on every run and fails the build the moment such a rule gains an
implementation without gaining a test. The exemption is a countdown, not a
loophole.

## Related

- [test-strategy.md](test-strategy.md), [traceability.md](traceability.md)
- [../10-ai-coding/CHANGE_PROTOCOL.md](../10-ai-coding/CHANGE_PROTOCOL.md)
