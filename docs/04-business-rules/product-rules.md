# Product business rules

### BR-PRODUCT-001 — Product is catalog identity, never monetary authority

Product stores a name, aliases and optional preferred unit. It stores no selling
price, stock or conversion. Selecting one never applies a price.

### BR-PRODUCT-002 — Sale snapshots do not follow catalog edits

A Sale line keeps its entered name, quantity/unit and unit price. Rename,
preferred-unit change and deactivation do not rewrite posted or draft history.

### BR-PRODUCT-003 — Product references are workspace-safe

A non-null Sale `productId` must resolve inside the command workspace. Missing and
cross-workspace references return `PRODUCT_NOT_FOUND`; free-text null references
remain supported.

### BR-PRODUCT-004 — Product lifecycle is named and versioned

Create, update, deactivate and reactivate are separate commands. Update and
lifecycle commands require `expectedVersion`; there is no generic patch or hard
delete.
