# Field observation packet

`FIELD_OPERATIONAL_OBSERVATION` is an external evidence format for recording
what a worker, owner or observer actually sees in a fresh-produce operation. It
is deliberately separate from workspace policy and canonical money/goods
commands.

The packet can capture source-linked facts before the repository has a product
workflow for them, including orders, supply commitments, arrivals, weighing,
inspection, disposition, grading, packing, allocation, dispatch, delivery,
payment/cash custody, returns, claims/credits, cost observations, pricing
observations, supplier relationship/performance observations and reconciliation
observations.

It does not decide:

- receivable/payable recognition, payment allocation or aging;
- inventory valuation, COGS, profit or waste value;
- supplier scores, reorder risk or other management metrics;
- whether a raw observation produced a canonical money or goods effect.

## Use

Create a private external packet from the blank template:

```bash
pnpm field:observation --example > field-observations.json
pnpm field:observation --config field-observations.json
```

The checker requires an observer, workspace reference, timestamp/date,
participant wording and an external evidence reference for every observation.
Correction observations must point to the observation they correct. An optional
`canonicalReference` links to a fact already recorded by the product; it does
not assert that the observation changed that fact.

Exit 0 means only that the packet is structurally usable. It is not field
validation, policy approval or production acceptance. Keep completed packets in
the approved external evidence store; never commit real names, amounts, photos,
tokens or customer data to this repository.

The evidence progression remains:

```text
Proposed → Policy Decided → Technically Implemented → Repository Verified
         → Field Validated → Production Accepted
```

## Related

- [operating model](../01-domain/operating-model.md)
- [policy-closure worksheet](../09-decisions/policy-closure-worksheet.md)
- [field-validation protocol](../00-product/field-validation-protocol.md)
- [pilot evidence report](pilot-evidence-report-template.md)
