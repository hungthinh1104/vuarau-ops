# M23 frozen H2–H6 field-validation protocol

Freeze the pass/fail criteria and exact pilot release SHA before the first
observation. Do not change either after observations begin. A new build starts a
new evidence series; never combine timings across SHAs without naming both.

## Record for every observed task

```text
release SHA:
hypothesis: H2 | H3 | H4 | H5 | H6
actor/persona:
canonical transaction/reference id:
transaction shape:
started / ended:
independent accuracy reference:
assistance: none | prompted | taken over
mistakes and corrections:
terminology observed verbatim:
recovery behavior:
final canonical state:
incident severity: none | P0 | P1 | P2 | P3
observer:
```

The independent reference is the depot's existing notebook/process, a source
document, or an independently counted physical quantity—not another screen derived
from the same canonical rows.

## Frozen hypotheses

| Hypothesis | Observed task                                                               | Pass criterion frozen before observation                                                                                  |
| ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| H2         | sales worker records a real multi-line Quick Sale                           | final Sale matches the independent reference; no uncorrected error; assistance and elapsed time are recorded              |
| H3         | warehouse worker records Receiving                                          | Product/unit/quantity and source Purchase match the independent receiving reference; correction path remains attributable |
| H4         | warehouse/delivery workers dispatch and return                              | physical quantities and lifecycle match independent handover/return evidence; no hidden inventory effect                  |
| H5         | owner explains one customer, supplier and inventory total from source links | explanation reaches every attributable source without developer/SQL help; discrepancies are recorded                      |
| H6         | owner/operator exports, restores and reconciles                             | encrypted artifact restored within policy targets; integrity and three reconciliations pass without developer repair      |

H2 is not a claim that software is faster than paper unless the paper process is
separately measured under a predeclared comparison. H6 cannot pass from a local
integration test or written procedure.

## Stop and evidence rules

- P0 stops all observations.
- P1 blocks the affected task until a fixed release is deployed and its technical
  regression evidence passes.
- P2/P3 remain observations unless safety requires escalation.
- Prompted and taken-over tasks do not count as unaided passes.
- A corrected mistake is retained in the evidence; correction never erases
  history.
- **Automated verification is not field validation.**

Use a fresh copy of the record block for every task. Signed sheets and customer
data stay in the approved external evidence store under ASM-030.
