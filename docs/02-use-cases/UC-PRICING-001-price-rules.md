# UC-PRICING-001 — Record and resolve an explicit price rule

## Intent

An authorized operator records a dated Product/grade/unit price fact. A sale
workflow may ask for a resolution candidate, but the resulting posted Sale keeps
the final agreed price as its own immutable snapshot.

## Contract

- `pricing.record` validates the command, workspace references, exact integer
  money and override reason before inserting one append-only rule.
- `pricing.list` returns workspace-scoped, deterministic price history.
- `pricing.resolve` evaluates effective time, exact unit and quantity threshold;
  it returns `none`, `selected` or `ambiguous` rather than guessing.
- Authorization is checked before repository reads or writes. A retry replays the
  command receipt through the shared command pipeline.

## Deliberate boundaries

This use case does not infer a price from a Product's legacy default field, does
not convert units, does not overwrite posted Sale lines and does not claim that a
discount, fee or customer-precedence choice is field-validated. Those are visible
policy decisions for depot validation.

## Evidence state

`Proposed → Policy Decided → Technically Implemented → Repository Verified` is
complete for the explicit contract. `Field Validated` and `Production Accepted`
remain open.
