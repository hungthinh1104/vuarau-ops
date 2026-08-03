# ADR-0029 — Policy-backed Purchase correction after Receiving

## Status

Implemented in the core application; field validation remains a pilot gate.

## Context

A confirmed Purchase can be commercially wrong after some goods have already
been accepted. The original Receipt and inventory movement are canonical
physical facts. Reversing and re-receiving them merely to make a replacement
document look complete would fabricate a physical event.

## Decision

The workspace may approve a versioned `purchase_correction` policy with the
typed `commercial_replacement_only` strategy. When that policy is effective:

1. the original Purchase receives one `commercial_correction` void;
2. the void stores the exact policy version and creates one payable
   compensation;
3. original Receipts and inventory movements remain unchanged;
4. an optional replacement Purchase references the voided source and starts
   with independent receiving progress.

Without an approved, effective, supported policy, active-receiving commercial
correction fails closed. An ordinary void remains blocked. No command creates a
reverse/re-receive pair unless goods physically cross the inventory boundary.

## Consequences

Commercial payable truth can be corrected without rewriting physical truth. The
cost is a versioned workspace policy, policy-lineage storage on the void, a
separate receiving journey for the replacement, and an explicit pilot/field
validation gate.

## Alternatives considered

| Alternative                                       | Why rejected                                                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Reverse and re-receive the accepted quantity      | Fakes a physical movement that did not happen.                                                         |
| Allow every active-receiving void                 | Removes the authorization and audit boundary around a cross-dimension correction.                      |
| Copy source Receiving progress to the replacement | Makes two commercial documents claim the same physical fact.                                           |
| Keep the correction permanently blocked           | Leaves a supported commercial correction unavailable even when the workspace has an approved strategy. |

## Revisit when

Revisit when field operations require a different cross-dimension relationship,
multi-line partial correction semantics, supplier claim effects, or a physical
return/re-entry workflow. Do not revisit merely to make a replacement appear
received without a physical event.

## Scope and traceability

- Rules: BR-PURCHASE-006, BR-PURCHASE-007, BR-PURCHASE-008.
- Use case: UC-PURCHASE-004.
- Case: CASE-PURCHASE-CORRECTION-001.
- Rejection codes: `PURCHASE_CORRECTION_POLICY_UNAVAILABLE`,
  `WORKSPACE_POLICY_DEFINITION_INVALID`.
- Tests: TC-PURCHASE-CORRECTION-001 through TC-PURCHASE-CORRECTION-004 and
  TC-E2E-PURCHASE-CORRECTION-001.

Field acceptance, operator authorization and pilot readiness remain separate
from the technical implementation and are tracked under ASM-036.
