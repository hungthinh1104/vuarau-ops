# UC-EVIDENCE-003 — Record and review a source-linked debt observation

## Intent

An authorized worker records what a customer, collector or document says about
payment terms, an agreed due date, a promise to pay, a payment reference or a
collection note. The record remains attributable and correctable without
turning an observation into an overdue conclusion or a ledger allocation.

## Contract

- `evidence.recordDebtObservation` requires a source reference, preserves exact
  participant wording and keeps missing fields as `null`.
- The command is workspace-scoped, authorized before mutation, idempotent and
  append-only. A correction is a new observation linked to an earlier one in
  the same workspace.
- `evidence.getDebtObservation` and `evidence.listDebtObservations` return the
  stored facts in deterministic recorded-time order.
- The observation does not create a CustomerAccountEntry, mark a Sale overdue,
  allocate a Payment or change Cashbook truth. The canonical `dueAt` on a Sale
  remains the only current source for its technical due-state read.
- Backup V15 includes the observation and restore validates customer and
  correction references before commit.

The authenticated Web Admin exposes `/evidence/debt` to `evidence.read` users.
Workers with `evidence.record` may record a new observation from the same
screen. The screen states the fact-only boundary explicitly.

## Deliberate boundary

This use case does not decide default terms, aging, allocation order, credit
limits, collection priority or anonymous-sale semantics. Those are ASM-041 and
other policy gates requiring field evidence before implementation.

## Evidence state

`Proposed → Policy Decided → Technically Implemented → Repository Verified` is
complete for the raw fact-capture contract. `Field Validated` and `Production
Accepted` remain open.
