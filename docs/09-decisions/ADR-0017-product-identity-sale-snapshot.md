# ADR-0017 — Product identity suggests; the Sale line snapshot remains truth

**Status:** accepted · 2026-07-29

## Context

Future supplier and goods flows need stable product identity, while existing Sale
history already relies on immutable typed snapshots and explicit price recall.

## Decision

Product is workspace-scoped master data with a stable id, display name, aliases,
optional preferred unit, active state and optimistic version. Lifecycle changes
use named create, update, deactivate and reactivate commands. There is no hard
delete, merge, inventory quantity, supplier link, unit conversion or price.

Quick Sale may copy Product id, current display name and preferred unit into an
editable line. It never fills or overwrites a price. Posting continues to persist
the name, unit, quantity and price snapshot; later Product rename, unit change or
deactivation cannot change historical Sales. Free text with `productId = null`
remains valid only while the Sale is a draft. Since M23.7, `PostSale` requires an
active canonical Product and matching snapshot before creating customer debt.

A non-null Product reference must exist in the same workspace. Deactivation
removes it from discovery, blocks a new posting that still references it, and
does not invalidate or rewrite existing posted Sale snapshots. Legacy posted
free-text history remains immutable and is surfaced as fulfilment attention.

Search is workspace-scoped, cursor-paged, diacritic tolerant and ordered by
display name then Product id. The offline catalog cache reuses ADR-0015 and carries
`fetchedAt`.

## Alternatives considered

- Reusing the mutable Product row as Sale history was rejected because a rename
  would rewrite what an old receipt appears to say.
- Adding price and inventory fields was rejected because neither lifecycle is
  part of a catalog.
- Auto-merging duplicate names was rejected because aliases and similar names do
  not prove business identity.

## Consequences

Product selection accelerates capture without becoming monetary authority.
Historical Sales remain explainable after catalog edits. M16 can reference a
stable Product id without forcing M15 to model stock.

## Revisit when

- A supplier or inventory aggregate needs another catalog field.
- A real unit-conversion policy is confirmed.
- Duplicate Product resolution earns an explicit merge workflow.
