---
title: Vựa Rau Shared Design Contract
status: active
version: 3.0
applies_to: [web-admin, mobile-pos, tablet-pos]
source_of_truth: true
---

# Vựa Rau — Shared Design Contract

> Editorial operations on web. Wholesale POS on mobile.

This file contains only cross-surface rules. Screen and performance rules live in the surface documents.

## Reading map

| Task                                        | Read                          |
| ------------------------------------------- | ----------------------------- |
| Shared token, primitive, naming, formatting | `design.md`                   |
| Web admin, dashboard, report, directory     | `design.md` + `WEB-ADMIN.md`  |
| Mobile/tablet transaction flow              | `design.md` + `MOBILE-POS.md` |
| Cross-surface feature                       | all three files               |

Do not infer mobile behavior from the web document or scale one surface into the other.

Precedence:

```text
Data integrity and domain invariants
> shared contract
> surface contract
> screen implementation notes
```

---

## 1. Product direction

```text
Web Admin  = observe, compare, investigate, reconcile
Mobile POS = select, enter, confirm, continue
```

The product must look purpose-built for wholesale produce operations, not like a generic SaaS template or retail POS clone.

Character:

- precise, not sterile;
- operational, not decorative;
- premium, not luxurious;
- dense, not crowded;
- calm, not low-contrast;
- domain-specific, not template-driven.

Reference blend:

```text
35% Attio   — light architecture and record workflows
30% Linear  — density and interaction precision
25% Ramp    — warm editorial surfaces and border-first elevation
10% Mercury — financial clarity and restraint
```

Use a warm neutral canvas, white surfaces, near-black text, and one plum brand accent. Green is semantic, not the default CTA color.

Hierarchy comes from typography → spacing → grouping → borders → color.

---

## 2. Shared principles

### DS-PRINCIPLE-01 — Action before decoration

Every card, chart, alert, and row must help the user understand, compare, decide, act, or verify.

### DS-PRINCIPLE-02 — Explain important numbers

Important metrics drill into their source records.

```text
Revenue → finalized sales
Cash collected → payments
Receivables → customer ledger
Stock variance → stock movements
Gross profit → sales, cost, waste, discounts
```

### DS-PRINCIPLE-03 — Preserve context

Search, drawers, history, and supporting lookup must not destroy active transactions, filters, selection, scroll position, or valid input.

### DS-PRINCIPLE-04 — Confirm consequences

Confirm actions affecting cash, debt, inventory, responsibility, finalized history, or difficult-to-reverse transitions. Do not confirm minor edits.

### DS-PRINCIPLE-05 — Keep state dimensions separate

```text
Order:       Draft → Confirmed → Closed → Cancelled
Fulfillment: Not prepared → Picking → Packed → Delivering → Delivered
Payment:     Unpaid → Partially paid → Paid → Refunded
Sync:        Local → Pending → Synced → Conflict
```

A stepper is a transition UI, not the domain model.

### DS-PRINCIPLE-06 — Performance includes certainty

```text
Interaction latency + data durability + state certainty
```

A fast response that hides whether the transaction is safe is incorrect.

---

## 3. Visual tokens

### 3.1 Light theme

| Token                |     Value | Role                           |
| -------------------- | --------: | ------------------------------ |
| `--canvas`           | `#F4F1ED` | warm background                |
| `--surface`          | `#FFFFFF` | primary surface                |
| `--surface-subtle`   | `#F9F7F4` | nested/grouped surface         |
| `--surface-selected` | `#F1EAF5` | selected surface               |
| `--ink`              | `#19161C` | primary text                   |
| `--ink-secondary`    | `#4F4A53` | secondary text                 |
| `--ink-muted`        | `#77717B` | metadata                       |
| `--border`           | `#E5E0E7` | hairline structure             |
| `--border-strong`    | `#CFC7D2` | emphasized structure           |
| `--brand`            | `#5A2F73` | primary action/focus           |
| `--brand-hover`      | `#49245F` | hover/pressed                  |
| `--brand-soft`       | `#EFE7F4` | selected brand wash            |
| `--fresh`            | `#3F7547` | freshness/valid positive state |
| `--fresh-soft`       | `#E8F1E7` | positive background            |
| `--warning`          | `#995E00` | attention/pending risk         |
| `--warning-soft`     | `#FFF1D8` | warning background             |
| `--danger`           | `#B33F3B` | destructive/critical           |
| `--danger-soft`      | `#FBE8E6` | danger background              |
| `--info`             | `#3D66A5` | informational state            |
| `--info-soft`        | `#E8EEF8` | info background                |

Rules:

- Plum is the only general-purpose action color.
- Green is for freshness, healthy state, or valid positive operation.
- Rising debt, waste, or overdue count is not positive.
- Semantic meaning never relies on color alone.
- Do not reduce semantic foreground colors with opacity.
- No decorative gradients or saturated full-card backgrounds.

Semantic pairs meet normal-text AA: fresh `4.72:1`, warning `4.76:1`, danger `4.82:1`, info `4.95:1`, brand `8.33:1`.

### 3.2 Dark-mode contract

Dark mode is not MVP. Components still consume semantic tokens; no hard-coded light values.

```css
[data-theme="dark"] {
  --canvas: #141116;
  --surface: #1c181f;
  --surface-subtle: #241f27;
  --surface-selected: #302437;
  --ink: #f4eff5;
  --ink-secondary: #c8c0ca;
  --ink-muted: #9e95a1;
  --border: #342e37;
  --border-strong: #4a414d;
  --brand: #b98bcf;
  --brand-hover: #c79dda;
  --brand-soft: #2e2433;
  --fresh: #84b88a;
  --fresh-soft: #1d2a20;
  --warning: #e6b45a;
  --warning-soft: #332918;
  --danger: #e58b86;
  --danger-soft: #35201f;
  --info: #8fafdd;
  --info-soft: #1e2734;
}
```

Charts use explicit light/dark palettes, never CSS inversion.

---

## 4. Typography and geometry

Fonts:

```text
Editorial headings: Newsreader
UI and data:        Geist Sans
Technical IDs:      Geist Mono
```

Use Newsreader only for page/section titles and editorial empty-state headings. Use Geist for all operational UI, tables, forms, charts, money, quantities, and POS. Use mono only for IDs, shortcuts, and sync/debug metadata.

| Role              |    Size |  Weight | Line height |
| ----------------- | ------: | ------: | ----------: |
| Micro label       |    11px |     500 |         1.3 |
| Caption           |    12px | 450–500 |         1.4 |
| Body small        |    13px | 400–500 |        1.45 |
| Body              |    14px | 400–500 |         1.5 |
| Body large        |    16px | 400–500 |         1.5 |
| UI subheading     |    18px | 550–600 |        1.35 |
| Section heading   |    22px |     500 |         1.2 |
| Page title        |    28px |     500 |        1.15 |
| Dashboard display |    34px |     500 |        1.05 |
| KPI value         | 28–32px | 550–600 |         1.1 |

Operational numbers use tabular lining numerals.

```css
.numeric {
  font-variant-numeric: tabular-nums lining-nums;
}
```

Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

| Element            | Radius |
| ------------------ | -----: |
| Badge              |    6px |
| Button/input       |    8px |
| Popover/menu       |   10px |
| Card/panel         |   12px |
| Large page surface |   16px |
| Filter/status pill |  999px |

Elevation is border-first. Standard cards use a 1px border and no shadow. Shadows are reserved for floating overlays.

```css
--shadow-popover: 0 8px 24px rgba(35, 23, 42, 0.1);
--shadow-overlay: 0 12px 36px rgba(35, 23, 42, 0.12);
```

---

## 5. Component contract

Foundation:

- shadcn/ui and Radix primitives;
- Tailwind tokens;
- Lucide icons;
- TanStack Table for web;
- Tremor/Recharts for analytics;
- dnd-kit only for configurable tiles and safe operational boards.

Do not add a second full design system.

Shared primitives:

```text
PageHeader, SectionHeader, PrimaryButton, SecondaryButton, IconButton,
SearchField, FilterBar, StatusBadge, MetricCard, TrendCard, DetailDrawer,
RecordTabs, ActivityTimeline, EmptyState, ErrorState, SyncStateIndicator,
ImpactConfirmation
```

Domain components:

```text
CustomerIdentity, DebtHealthBadge, OutstandingDebtStrip,
WholesaleUnitSelector, WeightInput, PreviousPriceChip,
PriceHistoryPopover, FreshnessIndicator, StockRiskBadge,
BusinessDayTimeline, DeliveryStateRail, CashRevenueChart,
UnreconciledPaymentAlert, HeldCartSwitcher, TransactionImpactSummary
```

Behavior:

- one primary action per region;
- explicit verb-based action labels;
- destructive actions do not visually compete with normal primary actions;
- cards group summaries/workflows, not every row or field;
- badge accessible names include the state dimension;
- drawers preserve list context; full pages handle deep work.

---

## 6. Shared state contract

### DS-STATE-01 — Transition anatomy

A consequential transition contains:

1. record context;
2. current state;
3. required input;
4. validation;
5. consequence summary;
6. explicit action label.

Use inline undo for low-risk reversible changes. Use a dialog, sheet, or dedicated flow for high-risk changes.

### DS-STATE-02 — No ambiguous success

After financial/inventory actions, state whether data is:

- saved locally;
- accepted by the server;
- pending synchronization;
- rejected;
- conflicted.

A spinner alone is not a state.

---

## 7. Motion

```text
Hover/focus:         100–140ms standard-out
Popover/menu:        140–180ms standard-out
Drawer/sheet enter:  180–220ms emphasized-out
Drawer/sheet exit:   140–180ms standard-in
State confirmation:  180–240ms emphasized-out
Row highlight:       600–900ms fade only
```

```css
--ease-standard-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-standard-in: cubic-bezier(0.4, 0, 1, 1);
--ease-emphasized-out: cubic-bezier(0.22, 1, 0.36, 1);
```

Use transforms for drawers/sheets, opacity plus small translation for popovers, and measured height only for short in-flow expansions. Do not animate overlay width or full-sheet height. Charts reveal in ≤180ms.

For reduced motion, remove spatial movement and use opacity changes ≤100ms.

---

## 8. Accessibility

- Normal text meets `4.5:1`; large text and essential non-text UI meet `3:1`.
- Focus indicators meet `3:1` and remain visible on canvas/surface.
- Critical controls work at 200% zoom.
- Normal sync updates use `role="status"`; commit failures/conflicts use `role="alert"`.
- Do not announce polling loops repeatedly.
- Icon-only controls have explicit names; tooltips are not accessible names.
- Closing overlays restores focus to the invoking control unless the workflow advances.
- Errors explain what failed, whether data is safe, and the next action.
- Validation preserves valid input and focuses the first invalid field.

---

## 9. Localization and formatting

Money:

```text
Ledger/confirmation: 1.250.000 đ
Dense KPI/chart:     1,25 tr
Editing input:        1250000
```

Use full values in confirmations, ledgers, exports, debt, and audit history. Abbreviations require a full accessible value. Negative values use `−250.000 đ`. Critical money is never truncated.

Mixed units remain line-specific:

```text
20 kg × 15.000 đ/kg
5 bó × 8.000 đ/bó
2 sọt · khối lượng thực 38,5 kg
```

Never sum heterogeneous units into a false total; use `3 dòng hàng`. Show normalized weight only when conversion is verified.

Timezone/business day:

- branch owns an IANA timezone and versioned business-day start;
- store UTC instant plus branch ID;
- preserve `transaction_time` and `recorded_at`;
- cross-branch reports state aggregation basis;
- show calendar and business date when they differ.

Use product-level wrappers around `Intl.NumberFormat` and `Intl.DateTimeFormat`. Allow labels to expand 30%. Search supports Vietnamese with/without diacritics. Exports declare locale, timezone, unit, and business-day basis.

---

## 10. Content and anti-patterns

Preferred:

```text
Xác nhận xuất xe
Ghi nhận thu 2.400.000đ
Hủy đơn và hoàn lại tồn kho
Lưu trên thiết bị
Chờ đồng bộ
```

Avoid `OK`, `Done`, `Submit`, `Continue`, or generic `Success`. Labels state the domain effect.

Do not:

- use a generic admin template unchanged;
- scale one surface into another;
- turn every collection into cards or every state into Kanban;
- merge order, fulfillment, payment, and sync;
- confirm every minor edit;
- hide frequent critical actions in overflow menus;
- use green for every increase;
- show charts without period, unit, comparison, freshness, and drill-down;
- use excessive shadows, gradients, glassmorphism, or glossy effects;
- silently overwrite conflicts or present estimates as exact;
- let AI commit a financial transaction without review.

---

## 11. Core implementation tokens

```css
:root {
  --canvas: #f4f1ed;
  --surface: #ffffff;
  --surface-subtle: #f9f7f4;
  --surface-selected: #f1eaf5;
  --ink: #19161c;
  --ink-secondary: #4f4a53;
  --ink-muted: #77717b;
  --border: #e5e0e7;
  --border-strong: #cfc7d2;
  --brand: #5a2f73;
  --brand-hover: #49245f;
  --brand-soft: #efe7f4;
  --fresh: #3f7547;
  --fresh-soft: #e8f1e7;
  --warning: #995e00;
  --warning-soft: #fff1d8;
  --danger: #b33f3b;
  --danger-soft: #fbe8e6;
  --info: #3d66a5;
  --info-soft: #e8eef8;
  --radius-sm: 6px;
  --radius-control: 8px;
  --radius-popover: 10px;
  --radius-card: 12px;
  --radius-page: 16px;
  --shadow-popover: 0 8px 24px rgba(35, 23, 42, 0.1);
  --shadow-overlay: 0 12px 36px rgba(35, 23, 42, 0.12);
  --font-editorial: "Newsreader", Georgia, serif;
  --font-ui: "Geist", "Inter", system-ui, sans-serif;
  --font-mono: "Geist Mono", "IBM Plex Mono", ui-monospace, monospace;
}
```

---

## 12. Agent rules and definition of done

1. Read this file and the correct surface document.
2. Start from the task and domain consequence, not a component gallery.
3. Choose the workflow/page pattern before styling.
4. Reuse primitives before creating new ones.
5. Create domain components when generic UI loses business meaning.
6. Preserve context and valid input.
7. Expose sync, freshness, and data-confidence states.
8. Test realistic data, long Vietnamese labels, and failure states.

A screen is complete only when it includes:

- correct state dimensions;
- primary and recovery paths;
- loading, empty, error, stale, offline, and permission states as applicable;
- appropriate keyboard/touch behavior;
- accessibility names and focus behavior;
- realistic money, quantity, and date formatting;
- surface performance budget;
- drill-down or audit path for important numbers.

```text
Theme:          Light-first, warm editorial
Brand accent:   Deep plum
Domain accent:  Produce green, semantic only
Typography:     Newsreader + Geist
Web:            Tables, drawers, action queues, drillable analytics
Mobile:         Wholesale POS, persistent carts, offline safety
Elevation:      Hairline borders, minimal shadow
Identity:       Domain components, not decorative styling
```
