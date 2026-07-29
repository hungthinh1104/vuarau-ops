# Transition catalog

This catalog covers every business lifecycle mutation and every command that
appends a money, goods, control, or recovery fact without changing a lifecycle
enum. The detailed guards and rejection codes remain in the business-rule and
command-contract catalogs.

## Versioned lifecycle transitions

| ID                     | Aggregate       | From → To                           | Command                  | Money effect       | Goods effect               |
| ---------------------- | --------------- | ----------------------------------- | ------------------------ | ------------------ | -------------------------- |
| T-CUSTOMER-001         | Customer        | ∅ → active                          | `CreateCustomer`         | none               | none                       |
| T-CUSTOMER-002         | Customer        | active → active                     | `UpdateCustomer`         | none               | none                       |
| T-CUSTOMER-003         | Customer        | active → inactive                   | `DeactivateCustomer`     | none               | none                       |
| T-CUSTOMER-004         | Customer        | inactive → active                   | `ReactivateCustomer`     | none               | none                       |
| T-PRODUCT-001          | Product         | ∅ → active                          | `CreateProduct`          | none               | none                       |
| T-PRODUCT-002          | Product         | active → active                     | `UpdateProduct`          | none               | none                       |
| T-PRODUCT-003          | Product         | active → inactive                   | `DeactivateProduct`      | none               | none                       |
| T-PRODUCT-004          | Product         | inactive → active                   | `ReactivateProduct`      | none               | none                       |
| T-SUPPLIER-001         | Supplier        | ∅ → active                          | `CreateSupplier`         | none               | none                       |
| T-SUPPLIER-002         | Supplier        | active → active                     | `UpdateSupplier`         | none               | none                       |
| T-SUPPLIER-003         | Supplier        | active → inactive                   | `DeactivateSupplier`     | none               | none                       |
| T-SUPPLIER-004         | Supplier        | inactive → active                   | `ReactivateSupplier`     | none               | none                       |
| T-SALE-001             | Sale            | ∅ → `draft`                         | `CreateSaleDraft`        | none               | none                       |
| T-SALE-002             | Sale            | `draft` → `draft`                   | `UpdateSaleDraft`        | none               | none                       |
| T-SALE-003             | Sale            | `draft` → `posted`                  | `PostSale`               | customer `+total`  | none                       |
| T-SALE-004             | Sale            | `draft` → `discarded`               | `DiscardSaleDraft`       | none               | none                       |
| T-PAYMENT-001          | Payment         | ∅ → `recorded`                      | `RecordCustomerPayment`  | customer `-amount` | none                       |
| T-PAYMENT-002          | Payment         | recorded/partial → partial/reversed | `ReverseCustomerPayment` | customer `+amount` | none                       |
| T-SUPPLIER-PAYMENT-001 | SupplierPayment | ∅ → `recorded`                      | `RecordSupplierPayment`  | supplier `-amount` | none                       |
| T-SUPPLIER-PAYMENT-002 | SupplierPayment | recorded/partial → partial/reversed | `ReverseSupplierPayment` | supplier `+amount` | none                       |
| T-PURCHASE-001         | Purchase        | ∅ → `draft`                         | `CreatePurchaseDraft`    | none               | none                       |
| T-PURCHASE-002         | Purchase        | `draft` → `draft`                   | `UpdatePurchaseDraft`    | none               | none                       |
| T-PURCHASE-003         | Purchase        | `draft` → `confirmed`               | `ConfirmPurchase`        | supplier `+total`  | none                       |
| T-PURCHASE-004         | Purchase        | `draft` → `discarded`               | `DiscardPurchaseDraft`   | none               | none                       |
| T-DELIVERY-001         | Delivery        | ∅ → `draft`                         | `CreateDeliveryDraft`    | none               | none                       |
| T-DELIVERY-002         | Delivery        | `draft` → `draft`                   | `UpdateDeliveryDraft`    | none               | none                       |
| T-DELIVERY-003         | Delivery        | `draft` → `cancelled`               | `CancelDeliveryDraft`    | none               | none                       |
| T-DELIVERY-004         | Delivery        | `draft` → `dispatched`              | `DispatchDelivery`       | none               | negative movement per line |
| T-DELIVERY-005         | Delivery        | `dispatched` → `delivered`          | `MarkDeliveryDelivered`  | none               | none                       |

## Membership and sharing transitions

| ID           | Record        | From → To                     | Command                         |
| ------------ | ------------- | ----------------------------- | ------------------------------- |
| T-MEMBER-001 | Membership    | ∅ → active                    | `AddWorkspaceMember`            |
| T-MEMBER-002 | Membership    | active → active with new role | `ChangeWorkspaceMemberRole`     |
| T-MEMBER-003 | Membership    | active → inactive             | `RevokeWorkspaceMembership`     |
| T-MEMBER-004 | Membership    | inactive → active             | `ReactivateWorkspaceMembership` |
| T-SHARE-001  | DocumentShare | ∅ → available                 | `CreateDocumentShare`           |
| T-SHARE-002  | DocumentShare | available → revoked           | `RevokeDocumentShare`           |

Share expiry is derived from time and is not a command transition.

## Append-only effects and corrections

| ID                     | Command                  | Canonical fact appended          | Cross-dimension effect                                  |
| ---------------------- | ------------------------ | -------------------------------- | ------------------------------------------------------- |
| T-SALE-VOID-001        | `VoidSale`               | Sale void                        | customer `-original total`; no goods effect             |
| T-CUSTOMER-ADJUST-001  | `AdjustCustomerDebt`     | manual customer account entry    | signed customer amount; never a Sale correction         |
| T-PURCHASE-VOID-001    | `VoidPurchase`           | Purchase void                    | supplier `-original total`; no goods effect             |
| T-SUPPLIER-ADJUST-001  | `AdjustSupplierAccount`  | manual supplier account entry    | signed supplier amount                                  |
| T-RECEIPT-001          | `RecordPurchaseReceipt`  | Purchase Receipt                 | positive inventory movement per line; no payable effect |
| T-RECEIPT-002          | `ReversePurchaseReceipt` | Receipt reversal                 | negative inventory compensation; no payable effect      |
| T-INVENTORY-ADJUST-001 | `AdjustInventory`        | manual inventory movement        | signed Product/unit quantity                            |
| T-RETURN-001           | `RecordDeliveryReturn`   | Delivery return                  | positive inventory movement; no customer-money effect   |
| T-DOCUMENT-001         | `GenerateDocument`       | immutable next document snapshot | none                                                    |

Replacement Sale and Purchase drafts use the ordinary create transition plus a
stable `replaces…Id`; the original must already be voided and structural
uniqueness permits one replacement.

## Projection and recovery commands

| ID               | Command                            | Permitted mutation                                                               |
| ---------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| T-PROJECTION-001 | `RebuildAccountProjection`         | replace disposable customer projection from canonical ledger                     |
| T-PROJECTION-002 | `RebuildSupplierAccountProjection` | replace disposable supplier projection from canonical ledger                     |
| T-PROJECTION-003 | `RebuildInventoryProjection`       | replace disposable Product/unit projection from movements                        |
| T-BACKUP-001     | `ExportWorkspaceBackup`            | no business mutation; creates attributable export evidence                       |
| T-BACKUP-002     | `RestoreWorkspaceBackup`           | transactionally import validated canonical rows into an empty recovery workspace |

Restore either commits the complete validated canonical set and reconstructed
projections or leaves the target unchanged. An identical command replay returns
the prior result without duplicate rows.

## Invariants across every transition

1. One command executes in one database transaction; its lifecycle, money, goods,
   audit and command-receipt effects commit together or not at all.
2. Every mutable aggregate transition increments its version exactly once.
3. Every accepted state change is attributable to workspace, actor and command.
4. Existing canonical account entries, inventory movements, posted commercial
   snapshots and generated document versions are never silently rewritten.
5. A replay returns the original result and creates no second transition or
   effect.
6. A refusal creates no business transition and consumes no new canonical source.
7. Commercial, financial and physical truth remain separate; only the explicit
   effects in this catalog may cross dimensions.

## Related

- [state-catalog.md](state-catalog.md)
- [product-invariants.md](../00-product/product-invariants.md)
- [command-contracts.md](../06-api-contracts/command-contracts.md)
- [sale-rules.md](../04-business-rules/sale-rules.md)
- [depot-operations-rules.md](../04-business-rules/depot-operations-rules.md)
