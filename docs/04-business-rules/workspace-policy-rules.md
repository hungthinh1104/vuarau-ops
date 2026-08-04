# Workspace policy rules

These rules govern the disabled-by-default policy registry. They do not choose
the policy values for a depot and they do not replace the existing operational
profile contract.

### BR-POLICY-001 — Policy versions are workspace scoped

Every policy version belongs to exactly one workspace. Reads, writes, uniqueness
and state transitions include `workspaceId`; an identifier from another workspace
is indistinguishable from not found to the caller.

### BR-POLICY-002 — Versions and effective ranges are explicit

One workspace may not create the same `policyKind` and `version` twice. An
effective end must be after its start. Approval and retirement timestamps are
part of the historical policy fact: a policy is eligible only when it was
approved by the read's knowledge cutoff, is inside its business effective
window, and was not retired before that business time. Retirement therefore
closes future availability without erasing a historical read. Approval rejects
an overlap with another active version of the same capability; the resolver
fails closed if corrupt data still contains more than one effective version.

### BR-POLICY-003 — Drafts have no business effect

Creating a draft records intent only. Drafts are never used as a fallback for
receivable/payable recognition, inventory valuation, cost, aging, planning,
supplier evaluation, reconciliation or recommendations.

### BR-POLICY-004 — Approval requires evidence and accountability

Approval requires a non-empty evidence-reference list, the authenticated actor,
an explicit reason and an audit record. Approval is a state transition from a
draft; a retired or already-approved version cannot be approved again.

### BR-POLICY-005 — Missing policy fails closed

Availability returns `unavailable` with a reason when no approved effective
version exists. The system must not infer a global default, zero, healthy state,
overdue label, reorder recommendation, supplier score, COGS/profit or AI advice.
When multiple approved versions exist, the highest version whose effective
window contains `asOf` is selected; a future or expired higher version must not
hide a lower version that is currently effective.

### BR-POLICY-006 — Policy infrastructure is not activated policy

The registry is a typed, versioned and recoverable infrastructure shell. A policy
definition is not executable merely because it is stored or approved. Each future
adapter must define its own canonical effect, authorization, idempotency,
concurrency, transaction, read model, correction, PostgreSQL and recovery
evidence before activation.

Policy capabilities without a typed definition contract are rejected at draft
creation. A generic JSON envelope is not sufficient evidence to approve or
activate a receivable/payable recognition or return/claim-credit rule.

## Related

- [UC-POLICY-001](../02-use-cases/UC-POLICY-001-manage-workspace-policy-version.md)
- [ADR-0028](../09-decisions/ADR-0028-versioned-workspace-policy-registry.md)
- [configurable operating model](../01-domain/operating-model.md)
- [policy closure worksheet](../09-decisions/policy-closure-worksheet.md)
