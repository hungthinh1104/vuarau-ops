# Pricing field-validation runbook

This runbook collects evidence for pricing precedence and adjustment policy. It
does not decide a rule from the current UI, and it does not promote a repository
test to field validation.

## What to observe

Use one real workspace and record the participant, channel, product, grade, unit,
quantity and the participant's exact wording. Keep the evidence reference in the
external field packet; do not commit names, prices, photos or customer data here.

Capture all three cases for each question:

- `normal`: one rule is clearly selected, or the worker enters a price because no
  rule exists;
- `partial_or_exception`: a quantity tier, customer-specific rule, discount,
  fee or competing rule makes the choice different from the normal case;
- `correction`: the worker identifies a wrong price/rule after checking the source
  record and explains the correction path.

Record each observation with `kind: "pricing_observation"`, participant wording
and an evidence reference. A pricing observation is source-linked evidence only;
it does not create a PriceRule, Sale, debt effect or override permission.

## Scenarios

1. Resolve the same Product/grade/unit at quantities below, exactly at and above
   a real quantity threshold.
2. Compare a general rule and a customer-specific rule for the same customer;
   record which one the worker says should win and why.
3. Present two rules with the same stated precedence and ask whether the worker
   chooses manually, asks an owner, or follows another observed procedure.
4. Observe a discount, fee or override: identify who may authorize it, what reason
   is recorded, and which source proves the agreed amount.
5. Change a rule after a Sale was posted and confirm whether the historical Sale
   remains the agreed snapshot.

## Stop conditions

Stop the workflow and mark `needs_more_evidence` when the participant disagrees,
the source is missing, the responsibility is unclear, or the correction would
change debt, inventory, cost or another canonical effect. Do not resolve the
disagreement by changing priority, adding a default, or treating an ambiguous
result as zero.

## Evidence state

The current repository state is:

`Proposed → Policy Decided → Technically Implemented → Repository Verified`

`Field Validated` and `Production Accepted` remain open until real workers and
the workspace owner confirm the recorded examples.

Related: [pricing use case](../02-use-cases/UC-PRICING-001-price-rules.md),
[field observation packet](field-observation-packet.md), and the
[policy-closure worksheet](../09-decisions/policy-closure-worksheet.md).
