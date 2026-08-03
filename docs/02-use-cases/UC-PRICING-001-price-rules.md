# UC-PRICING-001 — Record and resolve an explicit price rule

## Intent

An authorized operator records a dated Product/grade/unit price fact. Sale entry
asks the server for a resolution candidate when its Product, Grade, Unit and
quantity context is complete. The worker may explicitly apply a selected rule,
must resolve an ambiguous result manually, and may enter a confirmed price when no
rule exists. The resulting posted Sale keeps the final agreed price as its own
immutable snapshot.

## Contract

- `pricing.record` validates the command, workspace references, exact integer
  money and override reason before inserting one append-only rule.
- `pricing.list` returns workspace-scoped, deterministic price history.
- `pricing.resolve` evaluates effective time, exact unit and quantity threshold;
  it returns `none`, `selected` or `ambiguous` rather than guessing. Sale entry
  renders all three states and never applies a result as a side effect of choosing
  a Product.
- Web Admin validates exact money, quantity tiers, precedence bounds, effective
  ranges, final non-negative price and required override reasons before creating
  the command. These are technical input guards, not evidence that the depot has
  field-validated its commercial precedence or adjustment policy.
- Authorization is checked before repository reads or writes. A retry replays the
  command receipt through the shared command pipeline.

The authenticated Web Admin exposes `/pricing` for `pricing.read` users. It shows
the workspace-scoped rule history with product, grade, customer, unit, effective
range and final exact price. `pricing.manage` users may record a new rule from the
same screen; the screen has no edit or delete path because rules are append-only.

## Deliberate boundaries

This use case does not infer a price from a Product's legacy default field, does
not convert units, does not overwrite posted Sale lines, and does not calculate
margin warnings. A manual price remains the worker's explicit final agreement;
applying a rule is an explicit action, not an automatic override. It does not
claim that a discount, fee or customer-precedence choice is field-validated. Those
are visible policy decisions for depot validation.

## Evidence state

`Proposed → Policy Decided → Technically Implemented → Repository Verified` is
complete for the explicit contract. `Field Validated` and `Production Accepted`
remain open; use the [pricing field-validation runbook](../11-operations/pricing-field-validation.md)
to collect the missing precedence, tier, adjustment and correction examples.
