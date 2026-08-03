# ADR-0024 — Each depot selects an explicit operational profile

**Status:** accepted and implemented · 2026-08-02

## Context

Two depots may both sell wholesale vegetables while operating at very different
levels of control. One only needs Sale, Payment and customer debt. Another records
Purchase, accepted inventory, commercial grade and separate Delivery. Requiring the
same workflow everywhere creates fake clicks and fake data; allowing arbitrary
feature flags creates combinations whose money and goods meaning nobody can explain.

The local term “bông hàng” remains outside this decision. Its lifecycle has not been
defined and it is not used as a switch, aggregate or hidden synonym for a statement.

## Decision

Every workspace has one versioned `OperationalProfile` with explicit business modes:

| Choice             | Modes                            | Meaning                                                                 |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------- |
| Purchasing         | `disabled`, `purchase_receiving` | Whether Supplier/Purchase/Receiving is a new-write workflow             |
| Inventory          | `disabled`, `movement_ledger`    | Whether physical movements and balances are recorded                    |
| Commercial grade   | `disabled`, `required`           | Whether every new physical quantity carries a configured grade          |
| Delivery           | `disabled`, `sale_fulfilment`    | Whether Sale fulfilment is represented by a separate Delivery aggregate |
| Cashbook           | `disabled`, `accounts_ledger`    | Whether money locations, expenses and transfers are source-backed       |
| Business-day start | minute `0…1439`                  | Local Vietnam-time boundary used by date-filtered operational reports   |

This is a closed contract, not a generic key/value feature-flag service or rule
builder. A new mode is added only with command semantics, invariants, correction,
reconciliation, backup and tests.

Dependencies are structural:

- Purchase/Receiving requires inventory;
- separate Delivery requires inventory;
- required commercial grading requires inventory;
- cashbook is independent of Inventory and may be enabled for a sales/debt-only depot;
- disabling inventory therefore requires all three dependent workflows disabled.

## Enforcement

- Profile replacement is owner-only, versioned, whole-object and audited.
- The server loads the profile inside the same transaction as authorization.
- A command whose required workflow is disabled fails before claiming idempotency.
- Reads and historical documents remain available when a workflow is disabled.
  Disabling a workflow is not deletion and must not make prior facts disappear.
- `qualityGradeMode=disabled` uses the explicit ungraded inventory identity
  `QualityGrade = null`; software must not manufacture a “default grade”.
- Existing facts are never rewritten when the profile changes. A workspace may
  therefore have historical graded facts and later ungraded facts, each retaining
  the policy under which it was recorded.
- Reports use `businessDayStartMinute` with `transactionTime`, not `recordedAt`.
- Backup V6 introduced and Backup V10 preserves the profile, pricing and operational-evidence facts; restore applies them to the recovery workspace before
  restoring business data. V1–V4 remain restore-compatible using the legacy full-
  depot default.

## Consequences

**Good:** a small depot can operate with only the workflows it genuinely performs,
while a larger depot can enable the fuller source-backed model. Server behavior,
report date boundaries and recovery now agree on the selection.

**Cost:** mode changes are business decisions. They require a reason and may expose
mixed historical periods that reports and operators must interpret honestly.

**Not solved:** selecting a mode does not invent unresolved policy. Quality
inspection/quarantine, Supplier return, partial customer-return settlement,
driver cash, cashbook, valuation and other future contexts still need their own
canonical facts and decisions.

## Alternatives considered

| Alternative                         | Why rejected                                                           |
| ----------------------------------- | ---------------------------------------------------------------------- |
| One workflow for every depot        | Forces users to record facts that do not exist in their operation      |
| Arbitrary feature flags             | Allows unsafe combinations and hides business meaning in configuration |
| Per-user workflow selection         | Workflow semantics belong to the depot; roles only decide who may act  |
| Rewrite history when a mode changes | Destroys auditability and changes prior money/goods meaning            |
| Seed a fake “ungraded” grade        | Turns a software requirement into false master data                    |

## Revisit when

Revisit when a new workflow cannot be represented as one closed mode with explicit dependencies, correction and reconciliation, or when a profile transition requires a formal effective date instead of applying only to new commands.

## Related

- [ADR-0021](ADR-0021-multi-role-workspace-membership.md)
- [ADR-0022](ADR-0022-quality-inspection-and-lot-boundary.md)
- [time semantics](../07-data/time-semantics.md)
- [use-case completeness audit](../02-use-cases/use-case-completeness-audit.md)
