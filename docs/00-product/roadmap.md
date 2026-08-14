# Product roadmap

This is the current decision/status view. It is not a living changelog and does
not rewrite old release evidence. The immutable milestone record for M8–M25 is
archived in [roadmap-m8-m25.md](../archive/roadmap-m8-m25.md); its historical SHAs
remain historical.

## NOW

- Documentation governance is being normalized through the machine-readable
  [documentation registry](../10-ai-coding/documentation-governance.yml), with
  explicit authority, role, status, supersession and evidence identity.
- Operations semantics are one contract across domain derivation, Board DTO,
  close readiness, UI and tests: `work`, `uncertainty`, `integrity`, `control`.
- Runtime mutation ownership is reverse-traced through the
  [command registry](../10-ai-coding/command-registry.yml); every procedure has
  an actor-goal UC and classification, and every transition alias resolves to a
  runtime procedure.
- Repository technical work remains separate from field/provider validation.
  Current HEAD is unverified until the release gate is rerun on that exact SHA.

## NEXT

- Run the focused and full technical gates after this governance slice, then
  record new release evidence from the resulting exact SHA.
- Re-run the real deployment/provider checks: Supabase A→B authentication,
  real-phone smoke, provider PITR/RPO/RTO/restore and owner policy reviews.
- Execute the frozen H2–H6 field protocol and the supplemental V2 observations
  only with external participants, independent references and immutable packet
  references.

## LATER

- Close ASM-039–048 before activating COGS/profit, debt aging, reorder,
  supplier scoring, recommendations or AI management intelligence.
- Add only policy-backed adapters whose canonical source, time semantics,
  correction path, integrity behavior, drill-down and actor action are explicit.

## BLOCKED

Pilot readiness remains **BLOCKED/PENDING** until the external gates above are
recorded for one frozen release. Automated tests, disposable rehearsals and
repository checks cannot manufacture worker adoption, owner decisions or
provider recovery evidence.

## Status vocabulary

| Status               | Meaning                                                            |
| -------------------- | ------------------------------------------------------------------ |
| `implemented`        | Runtime behavior and applicable technical checks exist.            |
| `technically-proven` | A named technical artifact passed for its recorded SHA.            |
| `field-pending`      | A real worker/owner observation is still required.                 |
| `blocked`            | A policy, provider or external authority gate prevents activation. |

The current scope mirror is [scope.md](scope.md). Normative product invariants,
business rules and accepted decisions remain authoritative over this status view.

## Related

- [product-brief.md](product-brief.md)
- [scope.md](scope.md)
- [validation-plan.md](validation-plan.md)
- [documentation authority](../README.md)
