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
effective end must be after its start. `effectiveFrom`/`effectiveTo` are
business-time boundaries; `approvedAt` and `retiredAt` are system knowledge and
lifecycle facts. Approval rejects an overlap in business-effective windows even
when a later version is backdated. A decision resolver additionally requires the
policy to be approved before `decisionAt` and not retired before that decision.
A historical resolver uses only `knowledgeAt`, keeps the business window
separate from retirement time, and fails closed on overlap or invalid lineage.
Retirement therefore blocks new decisions without erasing the policy lineage
needed to correct or reopen an already-recorded fact.

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
When multiple approved versions are effective for the same business time, the
read is unavailable with a corruption diagnostic; it does not silently select a
highest version. A future or expired version must not hide a lower version that
is currently effective.

### BR-POLICY-006 — Policy infrastructure is not activated policy

The registry is a typed, versioned and recoverable infrastructure shell. A policy
definition is not executable merely because it is stored or approved. Each future
adapter must define its own canonical effect, authorization, idempotency,
concurrency, transaction, read model, correction, PostgreSQL and recovery
evidence before activation.

The exhaustive `policyDefinitionSchemas` registry is the sole definition
contract. Create, approval, restore, availability and runtime adapters validate
through that registry. Transport and persisted DTOs are discriminated unions
for supported capabilities; named capabilities with a `null` registry entry
cannot be created, restored or activated. A generic JSON envelope is not
sufficient evidence to approve or activate a receivable/payable recognition or
return/claim-credit rule.

## Related

- [UC-POLICY-001](../02-use-cases/UC-POLICY-001-manage-workspace-policy-version.md)
- [ADR-0028](../09-decisions/ADR-0028-versioned-workspace-policy-registry.md)
- [configurable operating model](../01-domain/operating-model.md)
- [policy closure worksheet](../09-decisions/policy-closure-worksheet.md)
