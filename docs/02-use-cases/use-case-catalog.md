# Use-case catalog

Every implemented use case in the depot transaction workflow:

```
Identity/workspace
  → Customer → Sale → customer account → Payment/correction
  → Supplier → Purchase → supplier account → Receiving → Inventory
  → Delivery → Return
  → Audit → Documents/sharing/reports → Export/restore/integrity
```

**Status** is the honest one: `implemented` means the backend does it and current
technical evidence proves the stated contract. It does not mean a depot has
field-validated the workflow. M23.14 also audits plausible business events that are
**not** implemented; those policy-blocked/discovery rows live in
[use-case-completeness-audit.md](use-case-completeness-audit.md) rather than being
hidden by the fact that every active trace-map UC is implemented.

The former operator-only projection rebuild remains available, but UC-ACCOUNT-003
now has a typed reconciliation read and an audited, capability-gated command. The
command refuses source or ledger corruption rather than hiding it.

## The catalog

| ID                | Use case                                    | Permission                      | Status      | Document                                                     |
| ----------------- | ------------------------------------------- | ------------------------------- | ----------- | ------------------------------------------------------------ |
| UC-AUTH-001       | Authenticate, resolve actor, authorize      | —                               | implemented | [UC-AUTH-001](UC-AUTH-001-authenticate-and-authorize.md)     |
| UC-AUTH-002       | Revoke a workspace membership               | `workspace.manage`              | implemented | [platform](platform-use-cases.md)                            |
| UC-AUTH-003       | View my capabilities                        | —                               | implemented | [platform](platform-use-cases.md)                            |
| UC-AUTH-004       | List the depots I may work in               | —                               | implemented | [platform](platform-use-cases.md)                            |
| UC-AUTH-005       | Manage workspace members and roles          | `workspace.manage`              | implemented | [platform](platform-use-cases.md)                            |
| UC-CUSTOMER-001   | Create a customer                           | `customer.create`               | implemented | [UC-CUSTOMER-001](UC-CUSTOMER-001-create-customer.md)        |
| UC-CUSTOMER-002   | Search and list customers                   | `customer.read`                 | implemented | [customer](customer-use-cases.md)                            |
| UC-CUSTOMER-003   | View a customer                             | `customer.read`                 | implemented | [customer](customer-use-cases.md)                            |
| UC-CUSTOMER-004   | Update a customer                           | `customer.update`               | implemented | [customer](customer-use-cases.md)                            |
| UC-CUSTOMER-005   | Deactivate a customer                       | `customer.deactivate`           | implemented | [customer](customer-use-cases.md)                            |
| UC-CUSTOMER-006   | Reactivate a customer                       | `customer.reactivate`           | implemented | [customer](customer-use-cases.md)                            |
| UC-SALE-001       | Create, edit, discard a sale draft          | `sale.create`                   | implemented | [sale](sale-use-cases.md)                                    |
| UC-SALE-002       | **Post a sale**                             | `sale.post`                     | implemented | [UC-SALE-002](UC-SALE-002-post-sale.md)                      |
| UC-SALE-003       | View and list sales                         | `sale.read`                     | implemented | [sale](sale-use-cases.md)                                    |
| UC-SALE-004       | **Void a sale**, and post a replacement     | `sale.void`                     | implemented | [sale](sale-use-cases.md)                                    |
| UC-PAYMENT-001    | Record a customer payment                   | `payment.record`                | implemented | [UC-PAYMENT-001](UC-PAYMENT-001-record-customer-payment.md)  |
| UC-PAYMENT-002    | Reverse a payment, fully or partly          | `payment.reverse`               | implemented | [UC-PAYMENT-002](UC-PAYMENT-002-reverse-customer-payment.md) |
| UC-PAYMENT-003    | View a payment                              | `payment.read`                  | implemented | [platform](platform-use-cases.md)                            |
| UC-ACCOUNT-001    | View the balance and timeline               | `debt.read`                     | implemented | [account](customer-account-use-cases.md)                     |
| UC-ACCOUNT-002    | Adjust a customer account by hand           | `debt.adjust`                   | implemented | [UC-ACCOUNT-002](UC-ACCOUNT-002-adjust-customer-account.md)  |
| UC-ACCOUNT-003    | Reconcile and rebuild the projection        | `debt.adjust`                   | implemented | [account](customer-account-use-cases.md)                     |
| UC-COMMAND-001    | Retries, duplicates, stale versions         | inherits                        | implemented | [platform](platform-use-cases.md)                            |
| UC-AUDIT-001      | Trace a transaction and its corrections     | `audit.read`                    | implemented | [platform](platform-use-cases.md)                            |
| UC-PRODUCT-001    | Manage and identify Product catalogue       | product permissions             | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-QUALITY-001    | Manage commercial grade vocabulary          | quality permissions             | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-SUPPLIER-001   | Manage Supplier master data                 | supplier lifecycle permissions  | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-SUPPLIER-002   | Record/reverse Supplier payment             | supplier payment permissions    | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-SUPPLIER-003   | Adjust Supplier account                     | supplier adjustment permission  | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-SUPPLIER-004   | Explain/reconcile/rebuild Supplier payable  | supplier account permissions    | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-PURCHASE-001   | Draft/edit/discard Purchase                 | purchase draft permissions      | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-PURCHASE-002   | Confirm Purchase                            | `purchase.confirm`              | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-PURCHASE-003   | View Purchase and Receiving progress        | `purchase.read`                 | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-PURCHASE-004   | Void/replace confirmed Purchase             | `purchase.void`                 | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-RECEIVING-001  | Record accepted physical goods              | `receiving.record`              | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-RECEIVING-002  | Reverse wrong Receipt                       | `receiving.reverse`             | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-RECEIVING-003  | Inspect Receiving progress                  | receiving read permission       | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-INVENTORY-001  | Inspect balance and movement history        | inventory read permission       | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-INVENTORY-002  | Record explained physical adjustment        | inventory adjustment permission | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-INVENTORY-003  | Reclassify accepted stock between grades    | `inventory.reclassify`          | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-INVENTORY-004  | Reconcile/rebuild inventory projection      | inventory recovery permissions  | implemented | [goods](goods-flow-use-cases.md)                             |
| UC-DELIVERY-001   | Draft/edit/cancel Sale fulfilment           | delivery draft permissions      | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DELIVERY-002   | Dispatch goods                              | `delivery.dispatch`             | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DELIVERY-003   | Acknowledge delivered handover              | `delivery.complete`             | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DELIVERY-004   | Record physical customer return             | `delivery.return`               | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DELIVERY-005   | Inspect Sale fulfilment                     | `delivery.read`                 | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DOCUMENT-001   | Generate immutable source snapshot          | `document.generate`             | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DOCUMENT-002   | Share/revoke document snapshot              | document share permissions      | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-DOCUMENT-003   | Read/validate document snapshot             | auth or share token             | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-CASH-001       | Manage cash accounts                        | `cash.account.manage`           | implemented | [cashbook](cash-use-cases.md)                                |
| UC-CASH-002       | Record/reverse operating expense            | cash expense permissions        | implemented | [cashbook](cash-use-cases.md)                                |
| UC-CASH-003       | Transfer/reverse money between accounts     | `cash.transfer`                 | implemented | [cashbook](cash-use-cases.md)                                |
| UC-CASH-004       | Record explained cash adjustment            | `cash.adjust`                   | implemented | [cashbook](cash-use-cases.md)                                |
| UC-CASH-005       | Inspect/reconcile/rebuild cash               | cash read/rebuild permissions   | implemented | [cashbook](cash-use-cases.md)                                |
| UC-REPORT-001     | Inspect source-backed operational reports   | `report.read`                   | implemented | [depot operations](depot-operations-use-cases.md)            |
| UC-OPERATIONS-001 | Run/observe service under trusted config    | platform operator               | implemented | [platform](platform-use-cases.md)                            |
| UC-OPERATIONS-002 | Export/validate/restore logical recovery    | workspace/recovery permissions  | implemented | [platform](platform-use-cases.md)                            |
| UC-OPERATIONS-003 | Prepare shadow pilot fail-closed            | pilot operator                  | implemented | [platform](platform-use-cases.md)                            |
| UC-OPERATIONS-004 | Correct posted Sale through supported paths | support + business permission   | implemented | [platform](platform-use-cases.md)                            |

## The template every use case answers

A use case in this repository is not a description of a screen. It is the contract
one operation must satisfy, and it is incomplete until all twenty fields are
answered — several of the most expensive mistakes in this system would have been
caught by the field that was skipped.

```
actor · trigger · preconditions · permission · inputs · happy path
alternative and rejection paths · state transition · account effect · audit effect
goods effect · idempotency · concurrency · offline policy · result DTO · capabilities
rules · cases · planned tests · UI states
```

Four of these are load-bearing and easy to leave blank:

- **account effect** — writing "none" is an assertion, and it gets a test
  (BR-SALE-010 exists because of this field);
- **goods effect** — Receiving, Dispatch and Return name their source-linked
  movement; a commercial or money-only command states `none`;
- **offline policy** — a depot works without signal; "not supported" is a valid
  answer, but it has to be given;
- **UI states** — every path above has to be renderable, including the ones nobody
  likes drawing ([UI state catalog](../06-api-contracts/ui-state-catalog.md)).

## Retired identifiers

IDs are never reused. When the terminology closed, `Order` became `Sale` and the
debt ledger became the customer account ledger; the identifiers below are recorded
so nothing reissues them.

Nothing here changed meaning. Every retired ID maps one-to-one onto its successor,
except `UC-ORDER-001`, which described two operations and is now two use cases.

### Use cases

| Retired      | Superseded by            | Note                                            |
| ------------ | ------------------------ | ----------------------------------------------- |
| UC-ORDER-001 | UC-SALE-001, UC-SALE-002 | Split: drafting and posting are separate events |
| UC-DEBT-001  | UC-ACCOUNT-002           | Renamed with the ledger                         |

### Business rules

| Retired                     | Superseded by                   | Note                             |
| --------------------------- | ------------------------------- | -------------------------------- |
| BR-ORDER-001 … BR-ORDER-009 | BR-SALE-001 … BR-SALE-009       | Same numbers, sale vocabulary    |
| BR-DEBT-001 … BR-DEBT-008   | BR-ACCOUNT-001 … BR-ACCOUNT-008 | Same numbers, account vocabulary |

Detailed change notes are in
[sale-rules.md](../04-business-rules/sale-rules.md) and
[customer-account-rules.md](../04-business-rules/customer-account-rules.md).

### Cases and tests

| Retired                         | Superseded by                       |
| ------------------------------- | ----------------------------------- |
| CASE-ORDER-001 … CASE-ORDER-007 | CASE-SALE-001 … CASE-SALE-007       |
| CASE-DEBT-001 … CASE-DEBT-007   | CASE-ACCOUNT-001 … CASE-ACCOUNT-007 |
| TC-ORDER-001 … TC-ORDER-013     | TC-SALE-001 … TC-SALE-013           |
| TC-DEBT-001 … TC-DEBT-008       | TC-ACCOUNT-001 … TC-ACCOUNT-008     |

### Transitions

| Retired     | Superseded by | Note                                                     |
| ----------- | ------------- | -------------------------------------------------------- |
| T-ORDER-001 | T-SALE-001    | Renamed                                                  |
| T-ORDER-002 | T-SALE-002    | Renamed                                                  |
| T-ORDER-003 | T-SALE-004    | A draft is **discarded** — no money moves                |
| T-ORDER-004 | T-VOID-001    | A posted sale is **voided** — the full amount moves back |

### Rejection codes

Renamed, not aliased. The old strings are retired and must never be reissued; the
full table, and the reasoning for breaking the usual "codes are API forever" rule,
is in the [error code catalog](../04-business-rules/error-code-catalog.md).

## Related

- [../04-business-rules/](../04-business-rules/sale-rules.md) — the rules these use cases cite
- [../05-casebook/sale-cases.md](../05-casebook/sale-cases.md) — the scenarios they must survive
- [../08-qa/trace-map.yml](../08-qa/trace-map.yml) — the machine-checked index
