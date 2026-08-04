# UC-POLICY-001 — Manage a versioned workspace policy

## Intent

An owner or accountant records a workspace-specific policy definition as a draft,
links field evidence, approves it for an effective period, or retires it. The
registry makes policy readiness explicit without deciding a universal market,
operating hour, shift, channel, valuation method or commercial outcome.

## Contract

- `policy.createDraft` records a workspace-scoped, versioned draft. A draft is
  inactive and cannot change money, goods, debt, payable, cost or management
  reports.
- `policy.approve` requires a draft, a non-empty evidence-reference list, an
  actor, a reason and a valid effective range. Approval is audited and remains
  inactive outside its effective window.
- `policy.retire` records an explicit state transition and is safe against a
  concurrent state change. Its optional `effectiveTo` closes the business
  interval so a successor can start without a permanent overlap. It does not
  rewrite facts recorded under the policy.
- `policy.get`, `policy.list` and `policy.availability` are workspace-scoped
  reads. Availability is `unavailable` when no approved effective version exists;
  callers must not substitute a zero, default or recommendation.
- New policy-dependent calculations use decision-time resolution, so a retired
  policy is never selected for a new valuation, planning, supplier-performance
  or management calculation. Historical resolution uses the business `asOf`
  separately from the server knowledge cutoff and is reserved for reproducing
  or correcting an existing result.
- The registry remains typed infrastructure: only contracts present in the
  authoritative registry can be stored or consumed. Unsupported capability
  names return `unsupported_definition_contract`, distinct from a missing
  approved version.

## Authorization and recovery

Policy reads require `policy.read`; mutations require `policy.manage`. Commands
use the common actor, workspace, idempotency and audit pipeline. PostgreSQL and
in-memory repositories enforce the same workspace/version/state constraints.
Backup V17 includes policy rows, commercial supply commitments, raw supply commitments, supplier observations and demand observations; V1–V16 remain restore-compatible with empty
policy collection.

## Deliberate boundary

This use case does not approve a debt-aging, valuation, reorder, supplier-scoring,
cash-forecast or AI policy on behalf of a workspace. A future policy adapter must
be typed, evidence-linked, versioned, reviewed and separately tested before it can
affect a canonical fact or derived management outcome.

The same boundary applies to product variants, OCR, forecasting, route
optimization and experiments: an extension may propose or call a canonical
command, but it cannot write a core fact directly. See the [extension boundary
rules](../04-business-rules/extension-boundary-rules.md).

## Evidence state

`Proposed → Policy infrastructure implemented → Repository verified` is complete
for the registry shell. Field validation, owner acceptance and activation of any
policy-backed outcome remain open.
