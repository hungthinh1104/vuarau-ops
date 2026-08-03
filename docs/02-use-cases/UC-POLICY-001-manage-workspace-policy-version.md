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
  concurrent state change. It does not rewrite facts recorded under the policy.
- `policy.get`, `policy.list` and `policy.availability` are workspace-scoped
  reads. Availability is `unavailable` when no approved effective version exists;
  callers must not substitute a zero, default or recommendation.
- The current registry is infrastructure. No existing Sale, Purchase, Payment,
  Receiving, Inventory, Cashbook or Report command consumes an arbitrary policy
  definition as an activated business rule.

## Authorization and recovery

Policy reads require `policy.read`; mutations require `policy.manage`. Commands
use the common actor, workspace, idempotency and audit pipeline. PostgreSQL and
in-memory repositories enforce the same workspace/version/state constraints.
Backup V15 includes policy rows, raw supply commitments, supplier observations and demand observations; V1–V14 remain restore-compatible with empty
policy collection.

## Deliberate boundary

This use case does not approve a debt-aging, valuation, reorder, supplier-scoring,
cash-forecast or AI policy on behalf of a workspace. A future policy adapter must
be typed, evidence-linked, versioned, reviewed and separately tested before it can
affect a canonical fact or derived management outcome.

## Evidence state

`Proposed → Policy infrastructure implemented → Repository verified` is complete
for the registry shell. Field validation, owner acceptance and activation of any
policy-backed outcome remain open.
