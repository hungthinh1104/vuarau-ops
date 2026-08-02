---
title: Vựa Rau Web Admin Design Contract
status: active
version: 3.0
applies_to:
  - web-admin
  - desktop-web
  - tablet-landscape-admin
requires:
  - design.md
does_not_apply_to:
  - mobile-pos
---

# Vựa Rau — Web Admin

This document governs web administration, operational directories, dashboards, reports, reconciliation, and investigation.

It does not define mobile transaction entry, held carts, POS keypad behavior, or offline commit semantics.

---

## 1. Web objective

Web Admin is optimized for:

- monitoring and reconciliation;
- filtering and comparing large data sets;
- investigating records and audit history;
- bulk operations;
- reporting and configuration;
- exception handling.

Default characteristics:

- light theme;
- compact-to-comfortable density;
- persistent sidebar;
- table-first record management;
- contextual detail drawers;
- dashboards with drill-down and action queues.

---

## 2. Application shell

| Element        |                           Value |
| -------------- | ------------------------------: |
| Sidebar width  | 232px expanded / 64px collapsed |
| Top header     |                            56px |
| Main max width |                          1600px |
| Page padding   |      24px desktop / 16px tablet |
| Grid gap       |                         12–16px |
| Detail drawer  |                       420–480px |

Page hierarchy:

```text
Page header
→ filters and controls
→ primary content
→ contextual detail
→ supporting history or audit trail
```

A page header contains:

- title;
- concise context;
- date/scope selector when relevant;
- one primary action;
- optional secondary actions.

---

## 3. Sidebar information architecture

Canonical order:

```text
Tổng quan
Cần xử lý

Vận hành
- Bán hàng
- Đơn hàng
- Giao hàng
- Nhập hàng

Đối tác & hàng hóa
- Khách hàng
- Nhà cung cấp
- Sản phẩm
- Kho hàng

Tài chính
- Công nợ
- Doanh thu
- Lợi nhuận
- Dòng tiền
- Báo cáo

Hệ thống
- Nhân viên
- Nhật ký hoạt động
- Cài đặt
```

`Cần xử lý` is a work queue, not another dashboard. It aggregates unresolved exceptions such as:

- overdue debt;
- delivery shortage;
- unreconciled driver cash;
- sync conflict;
- purchase without confirmed price.

### Breakpoints

| Width         | Sidebar behavior                                        |
| ------------- | ------------------------------------------------------- |
| `≥1440px`     | expanded by default; remember group state               |
| `1180–1439px` | expanded shell; secondary groups collapsed by default   |
| `900–1179px`  | 64px icon rail; group labels open in popover            |
| `<900px`      | off-canvas navigation; use tablet-specific page layouts |

Rules:

- Keep `Tổng quan`, `Cần xử lý`, and current group visible.
- Collapse `Hệ thống` by default unless role usage justifies it.
- Remove inaccessible destinations; do not show disabled navigation.
- Badges show actionable counts, not total record counts.
- Keep 12–14 visible destinations before scrolling.
- Persist expanded state, but reset safely when permissions change.

---

## 4. Density system

Density is a view-level choice, not a universal cosmetic preference.

| Mode        | Row height | Use                                                              |
| ----------- | ---------: | ---------------------------------------------------------------- |
| Compact     |       40px | single-line operational rows with no wrapping                    |
| Comfortable |       48px | default customer, debt, order, and supplier directories          |
| Rich        |       56px | intentional second line: alias, overdue context, latest purchase |

### WEB-TABLE-01 — Compact acceptance

Compact mode is allowed only when:

- primary cell remains one line;
- badges do not wrap;
- no information is clipped;
- row actions remain keyboard and pointer accessible.

Overflow semantic states become `+N`, tooltip, popover, or drawer detail. Do not shrink badges below legibility.

### WEB-TABLE-02 — Density persistence

Switching density preserves:

- filters;
- column widths;
- selection;
- sort order;
- scroll position.

### Validation fixture

Test at 1280px, 1440px, and 1600px with:

```text
Long customer name + alias
Overdue debt badge
Order-today status
Latest purchase timestamp
Assigned staff member
Warning or sync exception
```

---

## 5. Core web patterns

### 5.1 Directory

Use for customers, suppliers, products, and employees.

```text
Data table + search + filters + saved views + detail drawer
```

Required behavior:

- preserve filter and scroll state;
- support column visibility and pinning;
- support compact/comfortable density;
- open quick detail in a right drawer;
- open full record only for deeper work.

Do not use large card grids for hundreds of records.

### 5.2 Operations board

Use for active work only:

- orders waiting to be prepared;
- deliveries in progress;
- unresolved exceptions;
- incoming shipments awaiting confirmation.

Use grouped list or limited Kanban. Do not use Kanban for historical orders, debt ledgers, customer directories, or archives.

### 5.3 Transaction workspace

Use for creating sales, purchases, payments, returns, and stock adjustments.

```text
┌──────────────────────────────┬───────────────────────────┐
│ Search / select / context    │ Current transaction       │
│ Customer, product, history   │ Lines, totals, debt, CTA │
└──────────────────────────────┴───────────────────────────┘
```

The current transaction remains visible or recoverable while supporting context opens.

### 5.4 Record detail

```text
Summary header
→ primary actions
→ tabs
→ activity or ledger timeline
→ audit history
```

Typical customer tabs:

```text
Tổng quan | Đơn hàng | Công nợ | Thanh toán | Nhật ký
```

### 5.5 Analytics

Use KPI cards only for high-value summaries. Follow them with charts, tables, and actionable lists. Avoid all-card dashboards.

#### Policy gate

The dashboard candidates below are a surface contract, not evidence that every
metric exists. A metric may be rendered only when its canonical source, business
time, filters, integrity state and drill-down action are defined and tested.

Until the corresponding business policies are agreed and implemented, do not
render or infer:

- gross profit, margin or stock value without a COGS/valuation policy;
- overdue debt or credit-limit warnings without payment-term semantics;
- stockout or reorder risk without minimum stock, target stock and lead-time
  policy;
- supplier quality, price or return performance without source-linked supplier
  facts and claim/credit semantics.

The current operational reports remain source-backed views of canonical
transactions and ledgers. A missing policy is shown as unavailable or blocked,
never as zero, a stale projection or a recommendation.

---

## 6. Customer directory

Default columns:

- customer identity and alias;
- customer group;
- today's order state;
- current receivable;
- overdue receivable;
- latest purchase;
- assigned person when applicable;
- exception indicator.

Search supports:

- canonical name;
- spoken name and alias;
- phone number;
- market or area;
- customer code;
- identifying notes;
- Vietnamese with or without diacritics.

Example queries:

```text
chị lan
lan q8
lan rau
0908...
khách nợ
```

Quick customer creation during a transaction requires only:

```text
Display name*
Phone number
Area
```

The system detects likely duplicates before creation.

### Detail drawer

The drawer presents:

- customer identity;
- current and overdue debt;
- today's order;
- recent transactions;
- quick actions: create sale, record payment, call;
- link to full record.

Opening and closing the drawer preserves list context and returns focus to the invoking row.

---

## 7. Dashboard system

### WEB-DASH-01 — Purpose

The overview answers:

1. What happened?
2. What needs attention?
3. What should I open next?

### WEB-DASH-02 — Metric definitions

Never merge:

```text
Revenue        = value of finalized sales
Cash in        = payments actually received
Receivable     = amount customers still owe
Payable        = amount owed to suppliers
Gross profit   = revenue minus recognized cost of goods
Net cash flow  = cash in minus cash out
```

Example:

```text
Sales:            20.000.000đ
Cash collected:    8.000.000đ
New receivable:   12.000.000đ
Cost of goods:    14.000.000đ
Gross profit:      6.000.000đ
```

### WEB-DASH-03 — Overview composition

Top area:

- one dominant revenue/cash trend card;
- four compact financial or operational cards;
- period and business-day selector.

Dominant chart compares:

```text
Revenue generated
Cash collected
```

Compact card candidates:

- cash collected;
- customer receivables;
- supplier payables;
- cash and bank balance;
- unresolved deliveries;
- overdue customers;
- stock at risk.

Allow a mode switch:

```text
Tài chính | Vận hành
```

### WEB-DASH-04 — Analysis grid

Potential metrics:

- revenue;
- gross profit and margin;
- cash collected;
- new receivables;
- waste value and rate;
- completed orders;
- delivery exceptions;
- average order value.

Choose the correct visual form:

- line chart for trend;
- bar list for ranking;
- progress for target;
- stacked bar for composition;
- table for investigation;
- count for workload.

Not every metric gets a sparkline.

### WEB-DASH-05 — Action queue

Below analytics, always show actionable records.

```text
Cần xử lý hôm nay
- 3 đơn giao thiếu
- 2 chuyến nhập chưa chốt giá
- 5 khách vượt hạn mức nợ
- 1 tài xế chưa đối soát tiền
```

Other sections may include:

- overdue receivables;
- stock needing attention;
- unreconciled payments;
- price anomalies;
- synchronization conflicts.

### WEB-DASH-06 — Rules

- Every comparison states its reference period.
- Every card defines scope and freshness.
- A candidate metric blocked by an unresolved business policy is not displayed as
  a number or labelled as a recommendation.
- Real-time and reconciled values are visually distinct.
- Rising debt or waste is negative even when the delta is positive.
- Important metrics drill into records.
- Business-day boundaries use branch configuration, not naive calendar dates.

---

## 8. Reports and drill-down

A report must define:

- metric formula;
- included/excluded states;
- business-day and timezone basis;
- branch scope;
- currency and unit;
- freshness and reconciliation status;
- comparison period;
- drill-down records.

For current operational reports, the authenticated `report.definitions` read is
the machine-readable source for these semantics. UI code must not invent a
formula, date boundary, freshness state or action when the definition is absent.
Definitions currently cover source-backed operational views only; policy-blocked
metrics such as COGS, margin, aging and reorder risk remain unavailable.

### Report hierarchy

```text
Summary
→ trend/composition
→ ranked contributors
→ record table
→ export metadata
```

Do not let an export silently use different filters or date boundaries from the visible report.

### Financial uncertainty

If cost basis, purchase price, or reconciliation is incomplete, label the result:

```text
Estimated
Partially reconciled
Finalized
```

Do not present estimated profit as final profit.

---

## 9. Web components

### Data tables

Capabilities when applicable:

- sorting;
- filtering;
- column visibility;
- pinning;
- row selection;
- density;
- keyboard navigation;
- pagination or virtualization;
- saved views.

### Saved views

A saved view stores:

- filters;
- sorting;
- visible and pinned columns;
- density;
- group mode;
- branch and date scope when allowed.

Changing permissions must invalidate inaccessible view configuration safely.

### Drawers

Use detail drawers for quick inspection and common actions. Use full pages for deep analysis, long histories, or complex editing.

### Charts

Charts must include:

- period;
- units;
- comparison basis;
- freshness;
- accessible summary;
- drill-down action.

Do not animate chart reading for longer than 180ms.

---

## 10. Keyboard operation

All controls, tables, drawers, dialogs, and workspaces remain usable without shortcuts. Shortcuts accelerate, never replace, standard navigation.

| Shortcut      | Action                                                 |
| ------------- | ------------------------------------------------------ |
| `⌘/Ctrl + K`  | global command/search                                  |
| `/`           | focus current-list search when no text field is active |
| `G`, then `O` | Overview                                               |
| `G`, then `C` | Customers                                              |
| `G`, then `D` | Debt                                                   |
| `G`, then `R` | Reports                                                |
| `C`, then `S` | create sale                                            |
| `C`, then `P` | record payment                                         |
| `J` / `K`     | next/previous row in focused list                      |
| `Enter`       | open selected record or execute named primary action   |
| `Esc`         | close topmost overlay; never silently discard work     |
| `?`           | shortcut reference                                     |

Rules:

- sequential shortcuts timeout after about 1 second;
- show an unobtrusive sequence hint;
- do not capture shortcuts while typing;
- destructive actions never run from one unmodified key;
- focus returns to the invoking control after closing an overlay.

---

## 11. Web performance contract

Budgets are initial engineering targets and must be validated on representative devices and datasets.

| Interaction                      |                                  Target |
| -------------------------------- | --------------------------------------: |
| Internal navigation feedback     |                                  ≤200ms |
| Open detail drawer               |      start immediately, complete ≤220ms |
| Local filter/sort on loaded rows |                                  ≤100ms |
| Search result first paint        |            ≤150ms local / ≤500ms remote |
| Density switch                   |              ≤150ms without scroll loss |
| Dashboard shell usable           | ≤2.5s on standard office laptop/network |
| Chart interaction/tooltip        |                                  ≤100ms |

### WEB-PERF-01 — Table volume

Representative fixtures:

```text
10.000 customers
10.000 ledger entries
5.000 products
2.000 active/historical orders in current query scope
```

Do not render all records merely because the API returned them.

### WEB-PERF-02 — Virtualization policy

```text
<100 visible rows: no virtualization required
100–500: benchmark first
>500: prefer virtualization or server windowing
```

Virtualization must preserve:

- accessible row semantics;
- keyboard focus;
- selection;
- row anchor when opening a drawer;
- scroll restoration.

Rich rows require fixed or predictably measured heights. Do not allow unbounded badge wrapping inside virtualized rows.

### WEB-PERF-03 — State isolation

Opening a drawer, changing a row selection, or updating one record must not re-render the complete table and all dashboard charts.

Split state by responsibility:

```text
query/filter state
selection state
column/view state
record detail state
metric/chart state
```

### WEB-PERF-04 — Bundle boundaries

Load analytics libraries only on analytics/report routes. Do not include chart, export, or rich-table bundles in unrelated pages.

---

## 12. Web degraded states

Every major screen defines:

```text
Loading
Empty
Partial data
Stale data
Unauthorized
Server unavailable
Read-only mode
Maintenance
Export failed
```

Rules:

- partial data identifies missing scope;
- stale metrics display last-updated time;
- read-only mode keeps investigation available while disabling commits;
- a table error does not erase filters or previously loaded safe data;
- failed exports can be retried without rebuilding hidden filters.

---

## 13. Web acceptance matrix

Test at:

```text
1280×720
1440×900
1600×900
1920×1080
Tablet landscape around 1024px
Browser zoom 200%
```

Data fixtures include:

- long Vietnamese names;
- aliases;
- multiple semantic states;
- large VND amounts;
- negative adjustments;
- missing price/cost data;
- cross-branch dates;
- stale and partially reconciled metrics.

### Agent prompt

```text
Implement the requested web-admin screen using design.md and WEB-ADMIN.md.
Choose the correct pattern before styling. Preserve filters, selection, and scroll.
Use a table plus contextual drawer for directories; use action queues below dashboard analytics.
Show metric scope, period, freshness, and drill-down. Include loading, empty, stale,
partial, permission, and error states. Validate compact and comfortable density with
realistic Vietnamese content and large VND values.
```
