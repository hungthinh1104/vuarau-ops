# Field-validation protocol V2

Protocol version: `2`. The H2–H6 criteria below remain frozen and are not
rewritten when V2 is introduced. Existing packets keep their original protocol
version, release SHA and interpretation.

Freeze the pass/fail criteria and exact pilot release SHA before the first
observation. Do not change either after observations begin. A new build starts a
new evidence series; never combine timings across SHAs without naming both.

Before the session, validate the external packet against that exact SHA:

```bash
pnpm field:observation --config /secure/field-observations.json \
  --require-field-validation --release-sha <frozen-release-sha>
```

The command checks record completeness and contradictions only. It does not
turn a packet into product truth or replace an observer's sign-off.

Before `ops:pilot-readiness` can report the pilot as ready, the operator must
attach an externally reviewed H2–H6 packet reference in the pilot declaration.
The readiness check verifies that the declaration covers the frozen release; it
does not claim that a machine observed or accepted the field session.

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
scenario gate encountered: none | ASM-035 | ASM-036 | ASM-037 | ASM-038
scenario disposition: not-applicable | excluded-stop | resolved-in-release
observer:
```

The independent reference is the depot's existing notebook/process, a source
document, or an independently counted physical quantity—not another screen derived
from the same canonical rows.

## Pricing rule policy observation

Before a shadow observation uses the explicit pricing catalogue, record the
owner/worker answer for customer-specific versus list precedence, equal-priority
ties, quantity thresholds, effective-date boundaries, discounts, operational fees,
and override authority/reason. A repository test proves only the current
`none`/`selected`/`ambiguous` contract; it does not choose the depot's commercial
policy. Until the review is accepted with an external worksheet reference, price
resolution remains advisory and the worker must confirm the final Sale price.

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

## V2 supplemental hypotheses (not a replacement readiness gate)

H7–H10 extend observation vocabulary without changing the H2–H6 pilot gate or
rewriting old evidence. Each supplemental record uses the same frozen release SHA,
actor/observer and independent-reference rules, plus the following structured
metrics:

| Hypothesis | Question                                                                       | Required metric                                                        |
| ---------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| H7         | Can the operator explain money/goods that the system still leaves unexplained? | `unexplained-money`, `unexplained-goods`, both, none or not-applicable |
| H8         | Did the Board miss an exception or mark one resolved without sufficient fact?  | `missed`, `false-resolved`, `correct` or not-applicable                |
| H9         | Does the operator rely on external memory to understand the current truth?     | none, paper, person, both or not-applicable                            |
| H10        | How long does it take to understand and resolve the next action?               | `timeToUnderstandSeconds` and `timeToResolveSeconds`                   |

V2 metrics describe observation; they do not authorize a new money/goods effect,
turn a raw observation into policy, or promote pilot readiness. H7–H10 records are
accepted by `pnpm field:observation` only when the V2 metrics are complete, and
remain external evidence requiring human review.

## Stop and evidence rules

- P0 stops all observations.
- P1 blocks the affected task until a fixed release is deployed and its technical
  regression evidence passes.
- P2/P3 remain observations unless safety requires escalation.
- Prompted and taken-over tasks do not count as unaided passes.
- A corrected mistake is retained in the evidence; correction never erases
  history.
- If an ASM-035–038 event is declared `excluded_from_shadow_scope`, encountering
  it stops the affected task immediately. The facilitator records the event and
  does not improvise a replacement money/goods workflow.
- `resolved_in_release` evidence counts only for the exact frozen release SHA.
- **Automated verification is not field validation.**

Use a fresh copy of the record block for every task. Signed sheets and customer
data stay in the approved external evidence store under ASM-030.
