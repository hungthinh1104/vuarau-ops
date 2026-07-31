# Critical screen Storybook coverage

`design.md` calls Storybook the executable UI-state catalog. Component/state
stories are necessary but not sufficient: the operational screens below also need
a presentation-only View with representative mobile/desktop/error/empty states.

This checklist is intentionally load-bearing. `pnpm truth:check` verifies that
checked story paths exist. While any item remains unchecked, the M23 roadmap must
keep repository readiness **PENDING** rather than inferring completion from the
lower-level state catalog.

## Critical screens

- [x] Today / operational home — `apps/web/src/ui/screens/today-view.stories.tsx`
- [x] Sales list / management — `apps/web/src/ui/screens/sales-list-view.stories.tsx`
- [x] QualityGrade management — `apps/web/src/ui/screens/quality-grades-view.stories.tsx`
- [x] Quick Sale complete screen — `apps/web/src/ui/screens/quick-sale-view.stories.tsx`
- [x] Sale detail / fulfilment consequences — `apps/web/src/ui/screens/sale-detail-view.stories.tsx`
- [x] Customer detail / debt operations — `apps/web/src/ui/screens/customer-detail-view.stories.tsx`
- [x] Purchase detail / Receiving — `apps/web/src/ui/screens/purchase-detail-view.stories.tsx`
- [x] Product inventory / movement history — `apps/web/src/ui/screens/product-inventory-view.stories.tsx`
- [x] Delivery detail / dispatch-return lifecycle — `apps/web/src/ui/screens/delivery-detail-view.stories.tsx`
- [ ] Reports / source navigation — `apps/web/src/ui/screens/reports-view.stories.tsx`
- [ ] Workspace operations / integrity-recovery — `apps/web/src/ui/screens/operations-view.stories.tsx`

## Completion rule

A checked critical screen has, where applicable:

- a presentation-only View that does not require a live tRPC/Next router;
- mobile and desktop examples when layout differs materially;
- loading/empty/network or business-exception states that the screen can actually
  reach;
- role/capability variants when controls differ by permission;
- fixtures using published DTO types rather than untyped lookalikes;
- production page/container consuming the same View used by Storybook.

Do not check an item because child components have stories. The point of this list
is to catch wrong combinations and page-level information hierarchy.
