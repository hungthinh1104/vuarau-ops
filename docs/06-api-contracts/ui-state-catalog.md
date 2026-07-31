# UI state catalog

This catalog names user-visible states that the current application must be able
to render. It is derived from published domain/read contracts, not from an old
screen list or a designer-only wish list.

`apps/web/src/ui/patterns/sale/catalog-state.ts` is the machine-readable mirror.
`catalog-coverage.test.ts` asserts that this document, the mirror and Storybook
state declarations remain aligned.

**Coverage here means a renderable state example exists. It does not mean every
production page already has complete screen-level stories.** Screen-level
Storybook coverage is a separate repository-readiness gate.

## State families

### Identity and generic command states

| State                     | Source / meaning                              | Rendering obligation                                               |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| `signed_out`              | no Supabase session                           | provisioned email/password sign-in; no public sign-up              |
| `no_workspace_membership` | valid subject belongs to no active depot      | explain that identity is valid and access must be provisioned      |
| `membership_revoked`      | membership became inactive                    | end workspace authority and explain access was removed             |
| `last_owner_protected`    | owner-management guard                        | explain why the final owner cannot be removed                      |
| `loading`                 | request in flight                             | never substitute a zero/empty business value                       |
| `empty`                   | successful read returned no items             | state that nothing exists and, where applicable, next valid action |
| `validation_error`        | payload/input shape invalid                   | attach correction to the field/line and preserve entered data      |
| `business_rejection`      | valid command shape rejected by business rule | explain rule and next valid action; do not parse server prose      |
| `permission_denied`       | current role lacks permission                 | explain missing authority and who can perform the action           |
| `stale_version`           | optimistic-concurrency conflict               | reload/show current state; never silently retry new intent         |
| `duplicate_safe_retry`    | replay returned original committed result     | render success, not another failure                                |
| `command_in_progress`     | identical command is still executing          | wait/resubmit identical identity only                              |
| `unknown_network_outcome` | connection dropped after submission           | command may have committed; preserve identity and recover safely   |

### Customer money and Sale

| State                        | Source / meaning                                               |
| ---------------------------- | -------------------------------------------------------------- |
| `balance_receivable`         | customer owes depot                                            |
| `balance_settled`            | customer balance is exactly zero                               |
| `balance_customer_credit`    | depot owes customer credit                                     |
| `customer_active`            | Customer lifecycle active                                      |
| `customer_inactive`          | Customer deactivated but historical/debt truth remains visible |
| `sale_draft`                 | editable Sale draft; no posting effect yet                     |
| `sale_discarded`             | abandoned draft retained as history                            |
| `sale_posted`                | immutable posted Sale with active financial effect             |
| `sale_voided`                | posted Sale compensated by adjacent void fact                  |
| `sale_replaced`              | replacement Sale linked to corrected predecessor               |
| `no_due_date`                | nullable Sale due date absent; not an error/warning            |
| `due`                        | Sale has a due date not yet overdue                            |
| `overdue`                    | Sale due date has passed                                       |
| `payment_recorded`           | customer Payment has reversible amount remaining in full       |
| `payment_partially_reversed` | Payment has both original and reversed amount                  |
| `payment_reversed`           | Payment reversal reached full original amount                  |
| `reversal_amount_exceeded`   | requested reversal exceeds server remaining amount             |

### Supplier and Purchase

| State                      | Source / meaning                                                |
| -------------------------- | --------------------------------------------------------------- |
| `supplier_active`          | Supplier may participate in new supplier workflows              |
| `supplier_inactive`        | Supplier retained historically but unavailable for new Purchase |
| `supplier_balance_payable` | depot owes supplier                                             |
| `supplier_balance_settled` | supplier balance is exactly zero                                |
| `supplier_balance_credit`  | supplier account is credit to depot                             |
| `purchase_draft`           | editable Purchase draft                                         |
| `purchase_confirmed`       | immutable confirmed Purchase                                    |
| `purchase_discarded`       | abandoned Purchase draft retained                               |
| `purchase_voided`          | confirmed Purchase compensated by adjacent void fact            |

### Product, grade, Receiving and inventory

| State                           | Source / meaning                                                                       |
| ------------------------------- | -------------------------------------------------------------------------------------- |
| `product_active`                | Product is available to current workflows                                              |
| `product_inactive`              | Product retained historically but not selectable for new trade                         |
| `quality_grade_active`          | grade may classify new physical quantity                                               |
| `quality_grade_inactive`        | grade retained for history but unavailable for new classification                      |
| `no_active_quality_grades`      | workspace has no active commercial grade; current Sale/Receiving policy cannot proceed |
| `receipt_active`                | Receipt contributes inbound movements                                                  |
| `receipt_reversed`              | Receipt was compensated by explicit reversal                                           |
| `inventory_positive`            | Product/QualityGrade/unit projection is above zero                                     |
| `inventory_zero`                | projection is exactly zero                                                             |
| `inventory_negative`            | attributable movement sum is below zero; never clamped                                 |
| `inventory_legacy_unclassified` | immutable pre-grade history has no invented grade                                      |
| `inventory_reclassification`    | quantity moved between grades by conserving pair                                       |
| `inventory_spoilage`            | attributable negative adjustment records spoilage/loss                                 |

### Delivery and fulfilment

| State                            | Source / meaning                                                         |
| -------------------------------- | ------------------------------------------------------------------------ |
| `delivery_draft`                 | fulfilment proposal can still be edited/cancelled                        |
| `delivery_cancelled`             | draft was cancelled before dispatch                                      |
| `delivery_dispatched`            | goods left inventory                                                     |
| `delivery_delivered`             | dispatched Delivery was acknowledged at customer; no second stock effect |
| `fulfilment_unfulfilled`         | no net quantity fulfilled                                                |
| `fulfilment_partially_fulfilled` | some ordered quantity remains                                            |
| `fulfilment_fulfilled`           | exact ordered quantity is net fulfilled                                  |
| `fulfilment_returned_partial`    | return facts reopened part of previously fulfilled quantity              |
| `fulfilment_attention`           | legacy/inconsistent facts cannot support a normal fulfilment action      |

### Documents, reconciliation and operations

| State                              | Source / meaning                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| `document_share_available`         | capability token resolves and frozen snapshot passes validation                    |
| `document_share_expired`           | share is past expiry                                                               |
| `document_share_revoked`           | share was explicitly revoked                                                       |
| `reconciliation_consistent`        | canonical sources and rebuildable projection agree                                 |
| `reconciliation_inconsistent`      | projection differs from valid canonical sources and may require authorized rebuild |
| `reconciliation_not_found`         | requested reconciliation subject does not exist                                    |
| `reconciliation_integrity_failure` | canonical/source integrity prevents safe rebuild                                   |
| `workspace_integrity_healthy`      | workspace integrity read has no current attention condition                        |
| `workspace_integrity_attention`    | source/reference/projection/digest check requires operator attention               |

## Rejection mapping rule

A stable backend error code does not automatically become a new UI-state name.
For example `RECEIPT_QUANTITY_EXCEEDS_PURCHASE`, `DELIVERY_RETURN_EXCEEDS_DISPATCH`
and `QUALITY_GRADE_INACTIVE` normally render through `business_rejection`; version
conflicts render through `stale_version`; authorization failures render through
`permission_denied`. A distinct catalog state is justified when the screen has a
persisted/derived business condition that changes what the worker sees or can do.

## Coverage checklist

The formatting below is parsed by TC-WEB-012. Keep one lower_snake_case state per
`·`-separated item.

- [x] signed_out · no_workspace_membership · membership_revoked · last_owner_protected
- [x] loading · empty · validation_error · business_rejection · permission_denied
- [x] stale_version · duplicate_safe_retry · command_in_progress · unknown_network_outcome
- [x] balance_receivable · balance_settled · balance_customer_credit
- [x] customer_active · customer_inactive
- [x] sale_draft · sale_discarded · sale_posted · sale_voided · sale_replaced
- [x] no_due_date · due · overdue
- [x] payment_recorded · payment_partially_reversed · payment_reversed · reversal_amount_exceeded
- [x] supplier_active · supplier_inactive
- [x] supplier_balance_payable · supplier_balance_settled · supplier_balance_credit
- [x] purchase_draft · purchase_confirmed · purchase_discarded · purchase_voided
- [x] product_active · product_inactive
- [x] quality_grade_active · quality_grade_inactive · no_active_quality_grades
- [x] receipt_active · receipt_reversed
- [x] inventory_positive · inventory_zero · inventory_negative · inventory_legacy_unclassified
- [x] inventory_reclassification · inventory_spoilage
- [x] delivery_draft · delivery_cancelled · delivery_dispatched · delivery_delivered
- [x] fulfilment_unfulfilled · fulfilment_partially_fulfilled · fulfilment_fulfilled
- [x] fulfilment_returned_partial · fulfilment_attention
- [x] document_share_available · document_share_expired · document_share_revoked
- [x] reconciliation_consistent · reconciliation_inconsistent · reconciliation_not_found · reconciliation_integrity_failure
- [x] workspace_integrity_healthy · workspace_integrity_attention

## Screen-level combinations still required

State-story coverage is necessary but insufficient. Critical screen stories must
also prove meaningful combinations, including:

- Quick Sale with unresolved Product, inactive historical Product, no active grade,
  stale draft, offline/unknown outcome and success;
- split-grade Receiving and over-receipt rejection;
- inventory with multiple grades, negative balance, legacy unclassified history,
  reclassification and spoilage;
- partial Delivery, return, full fulfilment and fulfilment attention;
- reconciliation healthy/drift/integrity failure;
- pilot/operations surface with missing quality configuration and external evidence
  still pending.

These combinations belong to the subsequent screen-level Storybook pass; this
catalog does not claim they are already complete.

## Related

- [error-contract.md](error-contract.md)
- [capabilities.md](capabilities.md)
- [../03-state-machines/state-catalog.md](../03-state-machines/state-catalog.md)
- [../04-business-rules/error-code-catalog.md](../04-business-rules/error-code-catalog.md)
- [../02-use-cases/use-case-catalog.md](../02-use-cases/use-case-catalog.md)
