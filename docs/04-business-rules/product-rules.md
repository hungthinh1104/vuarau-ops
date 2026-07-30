# Product business rules

### BR-PRODUCT-001 — Product is catalog identity, never monetary authority

Product stores a name, aliases and optional preferred unit. It stores no selling
price, stock or conversion. Selecting one never applies a price.

### BR-PRODUCT-002 — Sale snapshots do not follow catalog edits

A Sale line keeps its entered name, quantity/unit and unit price. Rename,
preferred-unit change and deactivation do not rewrite posted or draft history.

### BR-PRODUCT-003 — Product references are workspace-safe

A non-null Product reference must resolve inside the command workspace. Draft
Sale lines may be unresolved while being captured. `PostSale` requires every
line to reference an active Product whose current name and preferred-unit policy
match the stored draft snapshot. Missing, inactive, cross-workspace, or stale
references are refused before any customer account effect.

### BR-PRODUCT-004 — Product lifecycle is named and versioned

Create, update, deactivate and reactivate are separate commands. Update and
lifecycle commands require `expectedVersion`; there is no generic patch or hard
delete.

### BR-PRODUCT-005 — Historical snapshots are never backfilled

Legacy posted lines without Product identity stay immutable and are surfaced as
attention/unfulfillable. A migration or read must not guess a Product from text.
