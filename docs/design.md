---
title: Vựa Rau Operational Interface Contract
status: active
version: 5.0
applies_to: [web-admin, mobile-pos, tablet-pos]
source_of_truth: true
---

# Vựa Rau — Quiet Operations Interface

> A calm, high-confidence workspace for a busy produce depot.

This is the single visual and interaction contract for the web admin and POS.
Use-case documents define surface workflows and
`06-api-contracts/ui-state-catalog.md` defines their supported UI states; runtime
contracts and business rules outrank this document.

## Direction

The interface is light, restrained and operational. It uses warm paper, flat
white work surfaces, dense readable data and one cyan action signal. It must not
look like a generic dashboard, a retail checkout, or a decorative food brand.

```text
Web admin: observe, compare, investigate, reconcile.
Mobile POS: select, enter, confirm, continue.
```

Hierarchy comes from information order, type, spacing and borders before colour
or elevation. One primary action exists in each decision region.

## Foundations

### Type

Use **Be Vietnam Pro** for every product-facing text role: display, headings,
body, labels, numbers, IDs and metadata. It is loaded through `next/font/google`
with Vietnamese and Latin subsets. Do not introduce a second display, mono or
fallback brand typeface.

| Role          | Size |  Weight | Line height |
| ------------- | ---: | ------: | ----------: |
| Caption       | 12px |     500 |         1.4 |
| Label         | 13px |     500 |        1.35 |
| Body          | 14px | 400–500 |         1.5 |
| Body large    | 16px | 400–500 |         1.5 |
| Section title | 20px |     600 |        1.25 |
| Page title    | 28px |     600 |        1.15 |
| KPI           | 30px |     600 |         1.1 |

Money, quantities, dates and tabular columns use `font-variant-numeric:
tabular-nums lining-nums`.

### Tokens

| Token           | Value     | Purpose                        |
| --------------- | --------- | ------------------------------ |
| `canvas`        | `#FAFAF9` | warm paper page background     |
| `surface`       | `#FFFFFF` | panels, fields and overlays    |
| `surface-muted` | `#F5F5F4` | grouped or hover surface       |
| `ink`           | `#0C0A09` | primary text                   |
| `ink-muted`     | `#78716C` | secondary text and metadata    |
| `border`        | `#E8E6E5` | default structural line        |
| `border-strong` | `#D6D3D1` | focused or separated structure |
| `brand`         | `#3BA6F1` | primary action and focus       |
| `brand-hover`   | `#3398E1` | primary-action press/hover     |
| `brand-soft`    | `#E8F5FE` | selected/action wash           |

Semantic state colours are not brand accents. They identify only an explicit
state, always with text or an icon: success/fresh, warning, danger, info and
offline. Never use a semantic state colour as the ordinary primary CTA.

### Geometry and elevation

- Spacing: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.
- Buttons, filter chips and compact controls are pill-shaped.
- Inputs use 10px radius; cards 16px; sheets and large work surfaces 20px.
- Borders provide structure. Standard cards are flat; only menu, dialog, sheet
  and an intentionally elevated summary may use `0 4px 16px rgb(12 10 9 / 5%)`.
- No gradients, glass, decorative colour washes or arbitrary shadows.

## Component system

`apps/web/src/ui/primitives/` is the only foundation-control system. It owns
accessible Button, LinkButton, IconButton, Checkbox, fields, Select, Dialog,
Sheet, Badge and Skeleton behaviour. It may use Base UI or native controls
internally, but no second
generated component library may sit beside it.

```text
primitives  → accessible generic controls, no domain knowledge
patterns    → domain-aware workflow and state components
screens     → visual composition of patterns
controllers → params, queries, commands, offline state and navigation
routes      → delegate to one controller; no UI or data orchestration
```

Controllers are the orchestration boundary, not a visual layer. They pass
typed state and callbacks into screens; screens compose patterns and primitives.
This keeps a route change or API retry policy from creating a second visual
control system.

Use variants with a bounded API; do not recreate button, input or card styling
in a route. Native select semantics and form compatibility must stay intact.

### Controls

- Primary: filled cyan, white text, explicit Vietnamese verb.
- Secondary: white/transparent with a hairline border and ink text.
- Destructive: outlined danger by default; solid only at the irreversible
  confirmation point.
- Icon-only controls require an accessible name.
- Minimum touch target is 48px on mobile; compact desktop controls must remain
  keyboard accessible.

## Surface composition

### Web admin

Persistent navigation frames a wide, centered work area. A page is normally:

```text
title and context → filters/actions → primary table or investigation surface
→ detail/history when needed
```

Tables are the default for operational directories. Cards summarize a decision,
exception or metric; they do not replace every row. Detail drawers preserve the
list context. Important money, stock and debt values link to their source facts.

### Mobile and tablet POS

POS is a transaction workspace, not a vertically stacked admin form:

```text
customer context → product selection → compact cart → persistent total/action dock
→ explicit review sheet → outcome and next action
```

Draft, post, retry, conflict and offline states must preserve entered values.
The dock never hides total, debt impact, blocked state or the primary action.

### Application shell and responsive contract

Authenticated operational pages use a flat sticky top bar with a structural border. The bar surfaces only the vựa đang làm việc, exceptional sync state (queued, blocked or offline) and AccountMenu. Theme, đổi vựa, vai trò and đăng xuất belong inside the account menu; a healthy sync state is silent.

Desktop navigation is a 240px sidebar that may collapse to a 72px icon rail. The collapsed choice is local to the device. Cấu hình and Quản trị start collapsed but remain keyboard accessible and preserve aria-current. Mobile navigation keeps the capability map stable: Hôm nay · Mua · Bán · Kho · Thêm. It must not replace those destinations with role-specific labels. When an ActionDock is mounted, mobile navigation is hidden until that dock unmounts.

Page content uses one of three bounded frames: form narrow (800px), detail standard (1120px) and directory/report wide (1320px). Detail pages place source content and history in the main column and a sticky SummaryRail on desktop; on small screens the summary moves above the action dock.

ActionDock is the only shared decision surface for a consequential transaction. It owns the visible summary, rejection/partial feedback, secondary actions and exactly one primary action. A screen must not create a second fixed or sticky bottom action bar. DisclosureSection hides secondary history, evidence, charts and management metrics until requested and exposes its state with aria-expanded and keyboard focus.

Directories keep search visible. A single filter axis uses chips; several filters use a sheet on small screens and an inline toolbar on desktop. Desktop tables and MobileRecordCard rows expose the same record order and semantic actions; they must not create duplicate hidden locators.

## States, motion and accessibility

- Keep order, payment, fulfillment and sync as separate state dimensions.
- A consequential action states the current fact, required input, impact and
  precise committed outcome. A spinner is never the only result.
- Normal text meets 4.5:1 contrast; focus and essential non-text UI meet 3:1.
- Dialog and sheet dismissal restore focus. Validation retains valid input and
  focuses the first invalid field.
- Use 120–180ms opacity/transform transitions. Reduced motion removes movement.
- Support Vietnamese labels without truncation and search with or without
  diacritics. Use full values for money, debt and audit history.

## Anti-patterns

Do not:

- reintroduce plum, green or dark-neutral as the general action colour;
- use two typefaces, local font fallbacks or a component-library-specific theme;
- make every collection a card or every state a pill;
- mix domain state with generic success decoration;
- hide frequent critical actions in menus;
- replace semantic E2E assertions because a layout changed;
- use CSS selectors, DOM order or `nth-child` as product acceptance locators.

## Definition of done

A refactored screen has a screen composition, realistic Vietnamese content,
loading/empty/error/permission states as applicable, keyboard and touch support,
and semantic E2E locators. Its business scenario and persisted assertions remain
unchanged unless the domain contract changes.
