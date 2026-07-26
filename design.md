# Vựa Rau — Design Reference

> Quiet operations — fast capture, visible consequences, controlled recovery.

**Theme:** light-first, high-contrast, operational  
**Platforms:** responsive web + mobile PWA  
**Primary users:** owner, sales staff, warehouse staff, delivery staff, accountant  
**Design goal:** frequent work must feel fast; risky work must feel explicit and controlled.

---

## Product Character

Vựa Rau is an operational system for wholesale vegetable depots.

The interface should feel:

- fast;
- trustworthy;
- calm;
- practical;
- easy to scan;
- safe around money, debt, inventory, and corrections.

It should not feel like:

- a decorative SaaS dashboard;
- a generic ERP;
- an accounting spreadsheet;
- an AI chatbot;
- a consumer shopping app.

Core principle:

> Frequency determines simplicity. Risk determines friction.

---

# Tokens — Colors

| Name          | Value     | Token                   | Role                               |
| ------------- | --------- | ----------------------- | ---------------------------------- |
| Canvas        | `#F7F8F6` | `--color-canvas`        | Page background                    |
| Surface       | `#FFFFFF` | `--color-surface`       | Cards, panels, forms               |
| Surface Muted | `#F0F3EF` | `--color-surface-muted` | Secondary sections, filters        |
| Ink           | `#17211B` | `--color-ink`           | Primary text                       |
| Ink Muted     | `#657068` | `--color-ink-muted`     | Secondary text                     |
| Border        | `#D8DED9` | `--color-border`        | Inputs, tables, cards              |
| Border Strong | `#B8C2BA` | `--color-border-strong` | Active or selected boundaries      |
| Leaf          | `#176B45` | `--color-leaf`          | Primary action, active state       |
| Leaf Hover    | `#125738` | `--color-leaf-hover`    | Primary hover                      |
| Leaf Soft     | `#E6F3EB` | `--color-leaf-soft`     | Positive context background        |
| Warning       | `#A85D00` | `--color-warning`       | Attention, override, stale data    |
| Warning Soft  | `#FFF2D8` | `--color-warning-soft`  | Warning surface                    |
| Danger        | `#B42318` | `--color-danger`        | Financial risk, destructive action |
| Danger Soft   | `#FDECEA` | `--color-danger-soft`   | Error surface                      |
| Info          | `#2457A6` | `--color-info`          | Informational state                |
| Info Soft     | `#EAF1FB` | `--color-info-soft`     | Informational surface              |
| Offline       | `#6857A8` | `--color-offline`       | Local-only and queued state        |
| Offline Soft  | `#F0EDFA` | `--color-offline-soft`  | Offline surface                    |

### Color Rules

- Use `Leaf` only for primary actions, active states, and confirmed positive status.
- Use `Danger` only for actual risk, rejection, reversal, or destructive action.
- Use `Warning` for stale data, threshold breach, and required attention.
- Never communicate status by color alone.
- Every status includes text.
- Do not use gradients.
- Do not use saturated decorative colors.

---

# Tokens — Typography

### Primary Font

**Inter** or system sans-serif with full Vietnamese support.

```css
--font-sans: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
```

### Type Scale

| Role       | Size | Weight | Line Height | Use                        |
| ---------- | ---: | -----: | ----------: | -------------------------- |
| Caption    | 12px |    500 |        1.35 | Metadata, timestamps       |
| Body Small | 14px |    400 |        1.45 | Table cells, support text  |
| Body       | 16px |    400 |         1.5 | Main content               |
| Label      | 14px |    600 |         1.3 | Form labels, controls      |
| Subheading | 18px |    600 |        1.35 | Card headings              |
| Heading    | 24px |    650 |         1.2 | Page heading               |
| Display    | 32px |    700 |         1.1 | Important money or summary |

### Number Emphasis

Money and quantity use tabular numerals.

```css
font-variant-numeric: tabular-nums;
```

Examples:

- `12.500.000₫`
- `125 kg`
- `−500.000₫`

Do not abbreviate transactional amounts as `12.5M`.

---

# Tokens — Spacing & Shape

**Base unit:** 4px  
**Default density:** comfortable  
**Web tables:** compact only when required

### Spacing

| Name | Value |
| ---- | ----: |
| 1    |   4px |
| 2    |   8px |
| 3    |  12px |
| 4    |  16px |
| 5    |  20px |
| 6    |  24px |
| 8    |  32px |
| 10   |  40px |
| 12   |  48px |

### Radius

| Element          | Radius |
| ---------------- | -----: |
| Inputs           |    8px |
| Buttons          |   10px |
| Cards            |   12px |
| Large panels     |   16px |
| Pills and status | 9999px |

### Shadows

Use minimal elevation.

```css
--shadow-sm: 0 1px 2px rgba(23, 33, 27, 0.06);
--shadow-md: 0 8px 24px rgba(23, 33, 27, 0.08);
```

No heavy floating shadows.

---

# Layout

## Mobile

- Single column.
- 16px page padding.
- Sticky primary action only when necessary.
- Bottom sheet for short choices.
- Full-screen flow for payment reversal, debt adjustment, or conflict resolution.
- Minimum touch target: `48×48px`.
- Primary button height: `52–56px`.
- List row height: `56–64px`.

## Web

- Sidebar width: `240–264px`.
- Main content max-width: `1440px`.
- Page padding: `24–32px`.
- Use split view only for reconciliation or list-detail workflows.
- Avoid nested cards.
- Prefer sections separated by spacing and borders.

## Breakpoints

```text
< 640px        mobile
640–1023px     tablet / compact
>= 1024px      desktop
>= 1440px      wide operations
```

---

# Navigation

## Mobile Navigation

Maximum five items:

1. Hôm nay
2. Đơn hàng
3. Khách hàng
4. Công việc
5. Thêm

`Công việc` changes by role:

- warehouse: Nhận / Soạn;
- delivery: Chuyến giao;
- accountant: Thanh toán;
- owner: Cảnh báo.

## Web Navigation

```text
Hôm nay
Vận hành
  Đơn hàng
  Nhận hàng
  Tồn kho
  Phân bổ
  Soạn hàng
  Giao hàng
Tài chính
  Công nợ
  Thanh toán
  Đối soát
  Ledger
Quan hệ
  Khách hàng
  Nhà cung cấp
Phân tích
Hệ thống
```

Only active modules appear.

---

# Core Components

## Primary Button

**Role:** main command

- Background: `Leaf`
- Text: white
- Height: 44px web, 52–56px mobile
- Radius: 10px
- Weight: 600
- Use once per view where possible

Labels describe the command:

- Xác nhận đơn
- Ghi nhận thanh toán
- Hoàn tác thanh toán
- Tạo điều chỉnh

Avoid `Lưu` or `OK` for consequential actions.

## Secondary Button

- White or transparent surface
- 1px border
- Ink text
- Same height as primary

## Danger Button

- White surface with danger text by default
- Solid danger fill only in final destructive confirmation
- Never adjacent to primary action without separation

## Input

- 44px web, 52px mobile
- 8px radius
- Visible label
- Unit displayed inside or beside numeric fields
- Preserve value after validation error

## Status Badge

Pill with icon or dot plus text.

Examples:

- Đã xác nhận
- Chờ đồng bộ
- Quá hạn
- Đã hoàn tác
- Cần xử lý

## Money Impact

Used before financial confirmation.

```text
Nợ hiện tại          11.350.000₫
Tăng thêm             1.350.000₫
Nợ sau giao dịch     12.700.000₫
```

The final consequence is visually strongest.

## Task Card

Contains:

- task title;
- affected customer/order;
- reason;
- urgency;
- one primary next action.

No decorative metrics.

## Entity Header

Contains:

- identity;
- primary status;
- important amount;
- available actions;
- sync state.

## Confirmation Summary

Contains:

- subject;
- transaction lines;
- amount or quantity;
- business consequence;
- warning;
- reason when required;
- explicit command button.

## Timeline Item

Contains:

- business action;
- actor;
- transaction time;
- recorded time when different;
- amount or quantity effect;
- reason;
- related record.

## Exception Panel

Contains:

1. what happened;
2. business impact;
3. trusted current state;
4. available resolution;
5. permission requirement.

## Data Table

- Right-align numbers.
- Sticky header when useful.
- Visible active filters.
- Comfortable density by default.
- Row selection only when bulk actions exist.
- Avoid technical IDs in first columns.

---

# Role Patterns

## Owner

Home shows:

- decisions requiring attention;
- customers exceeding debt policy;
- unsynchronized financial commands;
- cash and debt summary;
- operational exceptions.

Do not start with charts.

## Sales Staff

Home shows:

- Quick Order;
- recent customers;
- recent prices;
- current drafts;
- payment shortcut.

## Warehouse

Home shows:

- incoming tasks;
- picking tasks;
- shortage and damage exceptions.

Use large task cards and quantity controls.

## Delivery

Mobile-only priority:

- destination;
- phone;
- required goods;
- amount to collect;
- call;
- directions;
- confirm delivery;
- report issue.

## Accountant

Web-first:

- debt table;
- payment queue;
- unmatched payments;
- reconciliation;
- ledger;
- audit.

---

# Core Screens

## Quick Order

Required fields:

- customer;
- product;
- quantity;
- unit;
- unit price.

Context:

- last price;
- current debt;
- debt policy warning;
- transaction time;
- sync state.

Required states:

```text
default
empty
invalid_quantity
missing_price
over_credit_limit
stale_version
offline_queued
duplicate_safe
permission_denied
success
```

## Record Payment

Required fields:

- customer;
- amount;
- transaction time;
- payer when different;
- note when necessary.

Confirmation shows:

- current debt;
- payment;
- debt after payment;
- sync state.

Required states:

```text
exact
partial
overpayment
unallocated
different_payer
duplicate
offline
payload_conflict
permission_denied
success
```

## Customer Debt Detail

Header:

- customer;
- current debt;
- overdue amount;
- last payment;
- risk status.

Actions:

- Tạo đơn
- Ghi nhận thanh toán
- Điều chỉnh công nợ
- Đối soát
- Xem ledger

History rows show increase/decrease, source, actor, time, and reason.

## Reverse Payment

Controlled full-screen flow.

Show:

- original payment;
- already reversed;
- remaining reversible;
- debt impact;
- reason;
- permission;
- audit preview.

Never use `Xóa`.

## Sync Queue

Show:

- local command;
- affected entity;
- created time;
- current state;
- retryability;
- next action.

Do not expose technical queue terminology.

---

# UI State Contract

Every important screen covers five dimensions:

1. **Domain:** draft, confirmed, reversed.
2. **Workflow:** partial, completed, unresolved.
3. **UI:** loading, editing, validation error.
4. **Sync:** local, queued, synced, conflicted.
5. **Capability:** allowed, denied, override required.

A screen is incomplete if it only has the happy path.

---

# Feedback Rules

## Validation Error

- Keep entered data.
- Attach error to field.
- Explain the correction.

Bad:

> Dữ liệu không hợp lệ.

Good:

> Số lượng phải lớn hơn 0 kg.

## Business Rejection

Explain reason and next valid action.

Example:

> Đơn đã phát sinh công nợ nên không thể xóa. Hãy tạo điều chỉnh hoặc hoàn tác giao dịch liên quan.

## Permission Denied

Explain:

- permission missing;
- owner approval required;
- action unavailable.

## Offline

Use these user-facing labels:

| Internal   | Label                |
| ---------- | -------------------- |
| local_only | Đã lưu trên thiết bị |
| queued     | Chờ đồng bộ          |
| syncing    | Đang đồng bộ         |
| synced     | Đã đồng bộ           |
| failed     | Đồng bộ thất bại     |
| conflicted | Cần xử lý xung đột   |
| rejected   | Máy chủ từ chối      |

## Conflict

Show:

- local intent;
- current server state;
- safe resolution choices.

Never overwrite financial or inventory state silently.

---

# Do's and Don'ts

## Do

- Use one obvious primary action.
- Show debt, cash, or inventory impact before confirmation.
- Use text with every status.
- Make money and quantity easy to scan.
- Use progressive disclosure.
- Use role-specific home screens.
- Preserve input after errors.
- Design offline, rejection, permission, and stale-data states.
- Use Storybook as the executable UI state catalog.
- Link screens to business-rule and test IDs.

## Don't

- Don't build a dashboard before core workflows.
- Don't use cards for every block.
- Don't use charts without a specific decision question.
- Don't expose technical sync errors.
- Don't mirror desktop tables onto mobile.
- Don't use icon-only critical actions.
- Don't use generic `Save`, `OK`, or `Delete`.
- Don't hide risky actions behind silent automation.
- Don't use direct edit for finalized financial records.
- Don't design only the happy path.
- Don't add AI chat as primary navigation.

---

# Storybook Naming

```text
Orders/QuickOrder/Default
Orders/QuickOrder/OverCreditLimit
Orders/QuickOrder/OfflineQueued
Payments/RecordPayment/Partial
Payments/RecordPayment/Duplicate
Payments/ReversePayment/PermissionDenied
Customers/DebtDetail/StaleSummary
Sync/Queue/Conflict
```

Every P0/P1 state requires:

- fixture;
- Storybook story;
- automated or manual test reference.

---

# Figma Structure

```text
00 Foundations
01 Components
02 Patterns
03 Mobile Core
04 Web Core
05 Exceptions
06 Offline & Sync
07 Audit & Reconciliation
08 Archive
```

Frame naming:

```text
UI-ORDER-001 / Mobile / Default
UI-ORDER-001 / Mobile / Over Credit Limit
UI-PAYMENT-001 / Web / Duplicate
UI-CUSTOMER-002 / Web / Stale Summary
```

---

# Agent Prompt Guide

Use this section when asking Claude or another coding agent to implement UI.

## Global Instruction

```text
Follow design.md as the UI source of truth.

Do not invent new colors, spacing, status labels, or interaction patterns.

Before implementation:
1. identify role and platform;
2. list required domain, sync, capability, and error states;
3. reuse existing primitives and patterns;
4. create fixtures and Storybook stories;
5. implement only the requested screen;
6. run typecheck and relevant tests.
```

## Quick Order Prompt

```text
Implement UI-ORDER-001 Quick Order.

Platform: mobile-first responsive.
Primary actor: sales staff.
Primary action: Xác nhận đơn.

Required states:
default, empty, invalid quantity, missing price,
over credit limit, stale version, offline queued,
permission denied, success.

Use:
EntityHeader
MultiLineTransaction
MoneyImpact
SyncStatus
ConfirmationSummary

Do not implement backend business rules.
Render server capabilities and stable reason codes.
Add Storybook stories for all P0/P1 states.
```

## Record Payment Prompt

```text
Implement UI-PAYMENT-001 Record Payment.

Show current debt, payment amount, debt after payment,
payer, transaction time, and sync state.

Required states:
exact, partial, overpayment, unallocated,
different payer, duplicate, offline,
payload conflict, permission denied, success.

Use explicit action label: Ghi nhận thanh toán.
Never use generic Save.
```

---

# Quick CSS Reference

```css
:root {
  --color-canvas: #f7f8f6;
  --color-surface: #ffffff;
  --color-surface-muted: #f0f3ef;
  --color-ink: #17211b;
  --color-ink-muted: #657068;
  --color-border: #d8ded9;
  --color-border-strong: #b8c2ba;

  --color-leaf: #176b45;
  --color-leaf-hover: #125738;
  --color-leaf-soft: #e6f3eb;

  --color-warning: #a85d00;
  --color-warning-soft: #fff2d8;
  --color-danger: #b42318;
  --color-danger-soft: #fdecea;
  --color-info: #2457a6;
  --color-info-soft: #eaf1fb;
  --color-offline: #6857a8;
  --color-offline-soft: #f0edfa;

  --font-sans: Inter, ui-sans-serif, system-ui, sans-serif;

  --radius-input: 8px;
  --radius-button: 10px;
  --radius-card: 12px;
  --radius-panel: 16px;
  --radius-pill: 9999px;

  --shadow-sm: 0 1px 2px rgba(23, 33, 27, 0.06);
  --shadow-md: 0 8px 24px rgba(23, 33, 27, 0.08);

  --page-mobile-padding: 16px;
  --page-web-padding: 32px;
  --sidebar-width: 256px;
  --content-max-width: 1440px;
}
```

---

# Definition of Done

A screen is complete only when:

- role and platform are explicit;
- one primary action is clear;
- consequence is visible;
- server capability is represented;
- loading, empty, validation, rejection, permission, offline, conflict, stale, and success states are considered;
- mobile and web behavior are resolved;
- fixture exists;
- Storybook state exists;
- P0/P1 behavior has a test;
- implementation matches this file.
