# M23 shadow-pilot contract

## Frozen boundary

`603e830` is the pre-M23 technical baseline. M23 may add only provisioning,
validated onboarding, operational evidence and safety checks required to observe
the existing transaction system. It does not change commercial, financial or
physical semantics and does not authorize M24.

The deployed pilot release is recorded as a full 40-character SHA in every
readiness declaration, field worksheet, dry-run report, restore drill and incident
record. Evidence without that SHA is unattributable and does not pass a gate.

This is a **shadow pilot**:

```text
depot notebook/current process = operational truth
vuarau-ops                    = parallel observation record
```

No debt collection, supplier payment, dispatch decision or stock decision may
depend solely on the shadow record. Automated verification is technical evidence,
not field validation or production adoption.

## No speculative work

M23 freezes commands, meanings and public contracts. AI, forecasting, price
automation, route optimization, generalized workflow engines, microservices,
offline expansion and UI redesign are outside the batch. A discovered semantic
contradiction is recorded as a blocker; it is not silently repaired inside M23.

## Hard policy gates

| Gate    | Evidence required                                                                                          | Failure behavior                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| ASM-023 | owner signs when customer debt arises                                                                      | block real Sale posting                                                             |
| ASM-024 | owner signs what `PostSale` means                                                                          | block real Sale posting/delivery interpretation                                     |
| ASM-025 | owner signs when supplier payable arises                                                                   | block real Purchase confirmation                                                    |
| ASM-017 | owner reviews the actual role → permission table                                                           | block member provisioning for unreviewed roles                                      |
| ASM-018 | operator and owner verify the exact intended owner actor IDs                                               | block pilot while any unintended owner remains                                      |
| ASM-030 | owner/operator approve sharing and customer retention policy                                               | public document sharing remains blocked                                             |
| ASM-032 | owner/workers confirm whether every new physical quantity really requires commercial grade                 | block real Sale/Receiving if current universal-grade behavior is rejected           |
| ASM-033 | owner/receiver confirm that Receipt means accepted inventory and how damaged/rejected arrivals are handled | block affected Receiving flows if current semantics are rejected                    |
| ASM-034 | owner/warehouse confirm who may manage/reclassify grade and whether approval is needed                     | block grade-management/reclassification pilot work if current authority is rejected |
| ASM-035 | owner/workers classify Sale correction after prior fulfilment as excluded or resolved in the exact release | stop if encountered when excluded; block if unresolved                              |
| ASM-036 | owner/workers classify Purchase correction after prior Receiving as excluded or resolved                   | stop if encountered when excluded; block if unresolved                              |
| ASM-037 | owner/workers classify partial customer-return money/commercial semantics as excluded or resolved          | physical Return must not infer money; stop if excluded scenario occurs              |
| ASM-038 | owner/workers classify return of accepted stock to Supplier as excluded or resolved                        | generic adjustment must not masquerade as Supplier return; stop/block as declared   |

Signed evidence stays outside git. A rejected ASM-023/024/025 or ASM-032/033/034
answer preserves the contradiction and blocks the affected workflow; it never
changes ledger dates, seeds a fake grade, or changes wording to make readiness
green. ASM-032/033/034 use the
[quality-policy worksheet](../09-decisions/m23-quality-policy-worksheet.md).

ASM-035–038 are scenario gates, not generic “accepted” checkboxes. Each declaration
must say either `excluded_from_shadow_scope` with `stopIfEncountered: true`, or
`resolved_in_release` with evidence bound to the exact frozen SHA. `blocked` keeps
readiness red. Use the
[cross-dimension correction worksheet](../09-decisions/m23-cross-dimension-correction-worksheet.md).

## Incident severity and stop conditions

| Severity | Definition                                                                    | Action                                                             |
| -------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P0       | lost, duplicated, corrupt or cross-workspace canonical money/goods truth      | stop the entire pilot, preserve evidence, escalate immediately     |
| P1       | an affected workflow cannot continue safely or its result cannot be explained | block that workflow until a tested fix is deployed and re-verified |
| P2       | material friction or wrong presentation with canonical truth still safe       | record and continue unless the operator judges safety is affected  |
| P3       | minor copy/usability observation                                              | record for later triage; do not interrupt observation              |

No runbook authorizes manual edits to canonical rows, ledgers, movements, command
receipts or audit history.

## Completion states

Repository-owned checks may produce:

```text
repository readiness: PASS
pilot readiness: BLOCKED/PENDING
```

That is the expected state while owner evidence, the real two-account Supabase
smoke, a real-phone deployment test or provider PITR drill is absent.
`pilot readiness: PASS` requires all policy worksheets/scenario declarations,
exact members/owners, Customer/Product imports, disposable dry-run, same-tab A→B
auth and real-phone smoke, encrypted restore evidence, measured RPO/RTO, frozen
H2–H6 protocol and no known P0/P1. An excluded ASM-035–038 scenario is a hard
session stop if encountered; exclusion is not evidence that the workflow exists.

## Evidence sources

- [pilot onboarding](pilot-onboarding.md)
- [field-validation protocol](m23-field-validation-protocol.md)
- [deployment/recovery evidence](../11-operations/m23-deployment-recovery-evidence.md)
- [incident runbooks](../11-operations/m23-incident-runbooks.md)
