# Next-phase policy-closure worksheet — ASM-039 to ASM-048

This worksheet is for field interviews with depot owners, accountants, sales,
warehouse, delivery and supplier-facing workers. It is a question set, not a
product specification and not evidence by itself.

Do not fill an answer from the current UI or from a developer preference. Keep a
capability **policy-blocked** until the named participants provide a concrete
example, the answer is recorded, and the resulting rule can be traced to a
canonical source, correction path and reconciliation.

For each item record:

- the exact participants and depot context;
- at least one normal case, one partial/exception case and one correction case;
- the participant's wording and an external evidence reference;
- whether the answer is `decided_for_release`, `excluded_from_scope`,
  `blocked`, or `needs_more_evidence`;
- the release or process boundary to which the answer applies.

The record can be kept as an external JSON packet and checked without changing
product configuration:

```bash
pnpm policy:closure --example > policy-closure.json
pnpm policy:closure --config policy-closure.json
```

The template is intentionally blank and invalid until a real participant fills
the normal, partial/exception and correction examples. The checker requires all
ASM-039–ASM-048 exactly once, reports `policyDecisionReady`, `fieldValidated` and
`productionAccepted` separately, and exits non-zero while any policy is
`needs_more_evidence`, `blocked` or `excluded_from_scope`. It never promotes a
repository test into field evidence and never writes the packet back to the
repository.

## ASM-039 — Inventory valuation and COGS

Which valuation basis assigns cost to a Product/grade/unit quantity, and at what
business event does cost become COGS? Confirm how a historical report reproduces
the same result after later receipts, corrections and rebuilds. Do not choose FIFO,
weighted average, specific identification or another basis in code before the
depot and accountant answer.

## ASM-040 — Cost effects of waste, returns, claims and corrections

How are waste, spoilage, damage, rejected intake, customer returns, Supplier
returns, claims, credits and commercial corrections valued? For each event identify
the canonical source, whether it changes inventory cost, COGS, margin or payable,
and the exact compensation/reversal path. ASM-033, ASM-037 and ASM-038 remain
unresolved where the answer crosses physical and financial truth.

## ASM-041 — Debt terms, allocation and collection priority

What payment terms and due-date defaults apply, how are payments allocated when a
customer has several open obligations, and what does collection priority mean?
Confirm credit-limit behavior, customer credit and overpayment handling. This
extends ASM-001, ASM-003, ASM-004, ASM-015 and ASM-016; it must not silently turn
an unallocated payment or negative balance into an overdue amount.

## ASM-042 — Inventory planning and stock-risk semantics

The technical slice now supports an approved fixed-threshold policy over
Product/grade/unit facts. This worksheet still decides whether the depot wants
lead-time, velocity, forecast, stock-risk and action semantics beyond that slice.

Which Product/grade/unit combinations have minimum stock, target stock, supplier
lead time, velocity window, days-of-stock and reorder-point values? Define the
stock-risk states, their business-time basis, freshness and action. Lot, harvest
date and expiry remain separate discovery questions until field evidence exists.

## ASM-043 — Stocktake sessions and variance approval

The technical slice now supports a persisted policy-linked session, count facts,
approval variance and policy-controlled reopen compensation. This worksheet still
records the depot's field authority, evidence and rollout acceptance.

Does the depot need a persisted stocktake session, count evidence, variance
approval and reopen/correction path beyond attributable inventory adjustments?
Name who may approve, what evidence is retained, and how a variance reconciles to
canonical movements without rewriting them.

## ASM-044 — Walk-in and anonymous cash sales

Can a worker sell to an anonymous or walk-in customer? If so, what identity,
receipt, price, payment, return and debt semantics apply, and who may correct the
sale? Do not create a fake Customer merely to make the current customer-scoped
command pass.

## ASM-045 — Shift or business-day close

The repository now supports the narrow `observation_signoff` adapter: an approved
workspace policy chooses the exact observation kinds, one close is recorded per
business date, and reopen is an append-only expected-version transition. This does
not answer which wider field roles, variance thresholds, delivery work or financial
settlement semantics the depot wants; those still require owner validation before
broader rollout.

What must be signed off at the end of a shift or business day: cash count,
customer/supplier balances, stock, deliveries, unresolved work or another set?
Define the close boundary, authority, variance handling, reopen/correction path and
whether the close is an auditable canonical fact. ASM-026 only defines the current
business-day boundary; it does not decide a close workflow.

## ASM-046 — Bank and deposit reconciliation

The repository now supports the narrow `exact_cash_movement` adapter: an approved
policy chooses allowed CashMovement sources and an exact external reference,
account, amount and currency are stored as a financially-neutral match. This does
not settle a bank account, derive a variance or alter debt/payable/cash.

How are cash transfers, bank deposits and payment evidence matched? Define the
external statement input, matching key, settlement time, unresolved-item state,
variance authority and correction path. Reconciliation must not rewrite Customer
debt, Supplier payable or Cashbook source facts.

## ASM-047 — Supplier catalogue and commercial relationship

Which Supplier roles, supplied Products/grades/units, region/origin, lead time,
minimum order and payment-term fields are needed? Identify who may maintain each
fact, how effective history is preserved and how a wrong relationship is corrected.
Do not infer a Supplier role or origin from a Purchase line.

## ASM-048 — Supplier delivery, quality, return and credit performance

Which recorded facts establish delivery performance, quality outcomes, returns,
claims and credits, over what time window and under whose review? Decide whether a
score is needed, what it may be used for, and how missing or disputed evidence is
shown. No Supplier score or purchase recommendation is valid before this policy
and its source facts are closed.

## Closure handoff

When an item is answered, update the corresponding ASM row in
[`decision-backlog.md`](decision-backlog.md), then update the affected business
rule, use case, API/data contract, trace map and tests. If the answer changes a
canonical fact or cross-dimension effect, write an ADR before implementation.

The evidence state must remain explicit:

```text
Proposed → Policy Decided → Technically Implemented → Repository Verified
         → Field Validated → Production Accepted
```

Repository tests cannot move an item to `Field Validated` or `Production
Accepted`, and an unavailable policy must not be rendered as zero, healthy or
recommended.
