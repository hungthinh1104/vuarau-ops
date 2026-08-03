---
title: Vựa Rau Mobile POS Design Contract
status: active
version: 3.0
applies_to:
  - mobile-pos
  - tablet-pos
requires:
  - design.md
does_not_apply_to:
  - web-admin
---

# Vựa Rau — Mobile and Tablet POS

This document governs mobile and tablet transaction entry, delivery collection, offline behavior, held carts, performance, and resilience.

It does not define desktop dashboard composition, web table density, or full administrative reporting.

---

## 1. POS objective

Mobile POS is optimized for:

- one-handed operation;
- fast numeric input;
- interrupted workflows;
- persistent and held carts;
- weak or missing network;
- explicit financial confirmation;
- high-frequency wholesale transactions.

The default landing screen is **Bán hàng**, not a dashboard.

```text
Select customer
→ add products
→ enter quantity and price
→ review
→ choose payment/debt
→ choose fulfillment
→ confirm
```

---

## 2. Navigation and layout

Bottom navigation:

```text
Bán hàng | Đơn | Giao hàng | Công nợ | Thêm
```

Phone portrait:

```text
Product/search area
→ fixed mini-cart
→ full-screen cart sheet
```

Tablet or landscape:

```text
Product grid / search | persistent side cart
```

Do not force identical composition across portrait, landscape, and tablet.

### POS-LAYOUT-01 — Always-visible context

Show whenever relevant:

- selected customer;
- current debt and freshness;
- product search/grid;
- active cart summary;
- total amount;
- local/sync state.

### POS-LAYOUT-02 — Thumb zone

Frequent actions belong in the lower reachable region:

- quantity controls;
- keypad;
- cart CTA;
- product selection when practical.

Destructive actions are not adjacent to the primary action. Primary CTA is not flush against the system gesture area.

High-frequency controls use a 48px minimum target. Other touch controls use at least 44px.

---

## 3. Customer selector

Customer selection occurs inside the sale flow. Opening customer search must not destroy the cart.

Initial list is search-first and shows:

- recent customers;
- canonical name and alias;
- current debt;
- overdue state;
- order today;
- quick actions.

Do not show full address or dense history in the initial list.

Quick creation requires:

```text
Display name*
Phone number
Area
```

Show likely duplicates before creation.

### POS-CUSTOMER-01 — Data freshness

Debt context includes freshness when not current:

```text
Nợ cập nhật 6 phút trước
Dữ liệu công nợ đã cũ 42 phút
Chưa từng đồng bộ trên thiết bị này
```

A stale debt snapshot must not appear identical to confirmed current debt.

---

## 4. Product and action grid

The grid contains:

- frequently sold products;
- product groups;
- frequent operational actions.

Example actions:

```text
Thu tiền
Thêm khách
Đơn cũ
Khách trả hàng
Giá hôm nay
```

Rules:

- allow role-specific configuration;
- preserve tile position for muscle memory;
- do not reorder the full grid automatically;
- do not expose unauthorized actions;
- use category grouping when the catalog is too large;
- search remains available even when tiles are configured.

### POS-GRID-01 — Stable interaction

Remote search results may extend local results, but must not move the currently selected item or reorder visible exact matches while the user is acting.

---

## 5. Product line editor

Each line supports:

- quantity;
- wholesale unit;
- measured weight when relevant;
- unit price and pricing basis;
- prior customer price;
- current suggested price;
- quality grade/note;
- line total.

Example:

```text
Cải thìa
20 kg × 15.000đ/kg
300.000đ

[-] 20 [+]   [kg ▾]
[Giá cũ] [Đổi giá] [Ghi chú]
```

### POS-INPUT-01 — Quantity and price separation

Quantity and price are distinct modes with fixed labels and suffixes.

```text
SỐ LƯỢNG
20,0 kg

ĐƠN GIÁ
15.000 đ/kg
```

Do not rely on placeholder text to distinguish them.

Required protections:

- visible mode label;
- visible unit/pricing suffix;
- different contextual presets;
- outlier warning;
- clear focused field;
- review before commit.

### POS-INPUT-02 — Domain keypad

Use a domain keypad instead of relying entirely on the system keyboard.

Contextual presets:

```text
+0.5  +1  +5  +10
Giá cũ  Giá hôm nay  Xóa
```

Presets vary by unit and product group.

### POS-INPUT-03 — Mixed units

A cart total summarizes money and line count. It does not falsely add `kg + bó + sọt`.

```text
3 dòng hàng · 1.250.000đ
```

Show normalized weight only when conversion is verified.

---

## 6. Persistent and held carts

The active cart survives:

- navigation;
- app backgrounding;
- calls and interruptions;
- temporary network loss;
- customer/product lookup;
- process restart after a safe local write.

Keep these concepts distinct:

```text
Active cart
Held cart
Confirmed order
```

Example switcher:

```text
Chị Lan · 4 dòng
Anh Bình · 7 dòng
Khách lẻ · 2 dòng
```

### POS-CART-01 — Ownership

Every held cart has:

- branch;
- user/shift owner;
- device origin;
- created/updated time;
- local/sync state.

A second user may resume it only through an explicit ownership transfer or permitted shared-cart flow.

### POS-CART-02 — No silent expiry

Do not silently delete held carts. Old carts show:

```text
Đơn giữ 14 giờ
Giá đã thay đổi ở 3 dòng
Công nợ khách đã thay đổi
```

Actions:

```text
[Xem thay đổi] [Tiếp tục đơn] [Hủy với lý do]
```

### POS-CART-03 — Limits

The implementation must define and expose:

- maximum local held carts;
- retention period;
- storage pressure behavior;
- cross-device visibility;
- shift handoff behavior.

These are product configuration, not hidden implementation accidents.

---

## 7. Review and commit

Do not confirm every line edit. Confirm once before creating stock, cash, or debt effects.

Review includes:

- customer;
- line summary;
- discounts and fees;
- payment choice;
- fulfillment choice;
- old debt;
- new debt effect;
- data freshness warnings;
- final action label.

Example:

```text
Nợ cũ:       12.400.000đ
Đơn mới:      1.250.000đ
Nợ sau đơn:  13.650.000đ

[Xác nhận đơn 1.250.000đ]
```

### POS-COMMIT-01 — Commitment states

Separate:

```text
Draft local
Confirmed locally
Submitted to server
Accepted by server
Rejected / conflict
```

A locally confirmed offline sale is not visually identical to a server-accepted sale.

Example:

```text
Đã xác nhận trên thiết bị
Chưa được máy chủ chấp nhận
Công nợ và tồn kho trung tâm chưa được cập nhật
```

### POS-COMMIT-02 — Double-submit protection

On first submit:

1. create one stable `operation_id` / idempotency key;
2. disable duplicate commit;
3. persist locally;
4. send/retry using the same operation ID;
5. never create a new operation because the network timed out.

Button states:

```text
[Xác nhận đơn 1.250.000đ]
→ [Đang ghi nhận đơn…]
→ [Đã lưu trên thiết bị · Chờ đồng bộ]
```

A spinner without durability status is insufficient.

### POS-COMMIT-03 — Consequence summary

A consequential transition contains:

1. record context;
2. current state;
3. required input;
4. validation;
5. consequence summary;
6. explicit action label.

Example dispatch:

```text
Current: Ready for delivery
Driver: Hùng
Packages: 12
Cash to collect: 8.450.000đ

After confirmation:
- 92 kg moves to in-delivery state
- Hùng becomes responsible for 4 orders
- 8.450.000đ becomes cash-to-collect
- quantities lock until reopening

[Xác nhận xuất xe]
```

---

## 8. Offline and synchronization

Explicit user-facing states:

```text
Đã lưu trên máy
Đang chờ đồng bộ
Đã đồng bộ
Đồng bộ thất bại
Có xung đột
```

Do not represent all states with an unexplained cloud icon.

### POS-OFFLINE-01 — Outbox model

A durable outbox operation contains at least:

```text
operation_id
entity_id
operation_type
payload
created_at
attempt_count
last_error
next_retry_at
dependency_ids
priority
```

UI summarizes:

```text
3 giao dịch chờ đồng bộ
1 giao dịch cần bạn xử lý
```

Suggested priority:

1. confirmed sales and payments;
2. cancellations and reversals;
3. stock movements;
4. customer/product metadata;
5. analytics telemetry.

### POS-OFFLINE-02 — Retry classes

```text
Retryable
Blocked by dependency
Requires user decision
Permanently rejected
```

Do not retry permanent business-rule rejection indefinitely.

### POS-OFFLINE-03 — Stale snapshots

Potentially stale data includes:

- prices;
- receivables;
- stock;
- permission;
- credit limit.

Show last update and confidence. Initial thresholds must be configurable and validated with the business.

Example policy:

```text
Fresh:      <5 minutes
Stale:      5–30 minutes
High risk:  >30 minutes
Unknown:    never synchronized
```

High-risk transaction example:

```text
Dữ liệu công nợ đã cũ 42 phút.
Bạn đang ghi nợ thêm 8.200.000đ.

[Xem lại] [Tiếp tục với lý do]
```

### POS-OFFLINE-04 — Conflict handling

Conflicts are explicit. Show:

- local value;
- server value;
- affected consequence;
- safe resolution options;
- audit reason when overriding.

Do not silently use last-write-wins for debt, payment, inventory, or finalized transaction data.

### POS-OFFLINE-05 — Crash recovery

Required test:

```text
User taps Confirm
→ local write succeeds
→ app process is killed
→ server send did not complete
```

On restart:

- recover the same operation;
- do not create a duplicate;
- show its true state;
- continue with the same operation ID.

### POS-OFFLINE-06 — Storage failure

If durable local storage cannot accept a new transaction, block confirmation and explain the risk. Never display success when local durability is unknown.

---

## 9. Keyboard, sheets, and overlay behavior

### POS-OVERLAY-01 — One primary context

At one time, allow:

- one primary overlay;
- one input context;
- one primary CTA.

Avoid:

```text
Cart sheet
→ line editor sheet
→ unit popover
→ confirmation dialog
```

Prefer in-sheet panels, replaceable content, or a dedicated full-screen step.

### POS-OVERLAY-02 — System keyboard

Define behavior for:

- keyboard avoiding CTA and focused field;
- Android Back: close keyboard before closing sheet;
- iOS swipe-down: never discard unsaved input;
- safe-area insets;
- focus transfer quantity → price;
- returning to the previous line after unit selection.

### POS-OVERLAY-03 — Numeric input stability

The keypad and CTA stay in predictable positions. Opening validation or helper text does not move the active number keys under the user's finger.

---

## 10. Shared-device and hardware states

### POS-DEVICE-01 — Shared device

A shared phone/tablet supports:

- quick shift/user switch;
- PIN or biometric re-authentication;
- inactivity lock;
- visible current user and branch;
- permission by user, not by device;
- attribution for every transaction;
- privacy when switching users.

Lightweight header context:

```text
Ca sáng · Hùng
Chi nhánh Bình Điền
```

### POS-DEVICE-02 — Hardware degradation

Potential peripherals:

- Bluetooth printer;
- electronic scale;
- scanner;
- camera;
- QR/NFC payment device.

Common states:

```text
Sẵn sàng
Đang kết nối
Mất kết nối
Không có quyền
Không tương thích
Dữ liệu thiết bị không hợp lệ
```

Peripheral failure must not erase a committed transaction.

```text
Đơn đã ghi nhận.
Không thể in phiếu.

[Thử lại] [Chia sẻ phiếu] [Để sau]
```

---

## 11. POS motion

- Cart updates appear immediately; total animation ≤120ms.
- Cart sheet opens in ≤220ms.
- Held-cart switch uses 140–180ms crossfade or directional slide.
- Success feedback does not block the next sale.
- Sync changes use icon/text transitions, not pulsing loops.
- Do not use slow or elastic springs in payment, stock, or confirmation flows.

Use `translateY` and overlay opacity for sheets. Do not animate full-sheet height.

---

## 12. POS accessibility

### POS-A11Y-01 — Announcements

- Held-cart switch announces customer, line count, total, sync state, and active status.
- Cart totals/debt previews announce after a settled user action; debounce rapid entry.
- Financial commit failures use `role="alert"`.
- Sync progress uses polite status announcements.

### POS-A11Y-02 — Roving focus

A product grid may use roving tabindex, but normal Tab navigation remains available on tablet/keyboard devices.

### POS-A11Y-03 — Outdoor and harsh environment

Test:

- direct sunlight;
- low screen brightness;
- wet or gloved hands where relevant;
- one-handed use;
- high ambient noise;
- font scaling 125–200%;
- device vibration or unstable surface.

Pastel badges acceptable on desktop may require stronger contrast on POS.

---

## 13. POS performance contract

Budgets are initial engineering targets and must be validated on a low-end baseline device.

| Interaction                      |                                   Target |
| -------------------------------- | ---------------------------------------: |
| Installed POS becomes sale-ready |                                      ≤2s |
| Product tile feedback            |                                   ≤100ms |
| Quantity/price/total update      |                          ≤50ms perceived |
| Open cart sheet                  |                          complete ≤220ms |
| Local customer/product search    |                      first result ≤100ms |
| Remote search extension          | first result ≤500ms on reference network |
| Switch held cart                 |                                   ≤200ms |
| Persist local draft              |                                   ≤100ms |
| Confirm locally while offline    |                                   ≤300ms |

### POS-PERF-01 — Baseline device

Test on at least one representative low-end device:

```text
Android
3–4 GB RAM
low-to-mid CPU
storage nearly full
weak 4G and offline modes
non-latest WebView/Chrome within supported policy
```

Do not use developer laptops as the only performance reference.

### POS-PERF-02 — Volume fixtures

```text
5.000 products
10.000 customers
50 held carts
100 lines in one cart
500 pending outbox operations
10.000 ledger entries for lookup/history
```

These fixtures identify breakpoints; they are not all normal daily use.

### POS-PERF-03 — State isolation

A line edit must not re-render:

- entire product grid;
- all held carts;
- customer selector;
- sync diagnostics;
- unrelated cart lines.

Suggested state boundaries:

```text
catalog state
search state
active-cart state
cart-line state
customer snapshot
sync/outbox state
overlay state
```

### POS-PERF-04 — Local-first search

```text
Input
→ local exact/recent results
→ debounced remote request
→ cancel stale requests
→ merge without unstable reordering
```

Search supports:

- diacritics/no diacritics;
- alias;
- SKU;
- phone number;
- abbreviations;
- controlled typo tolerance when justified.

### POS-PERF-05 — Bundle boundaries

The POS critical path includes only:

- shell;
- catalog/search;
- customer selector;
- cart;
- keypad;
- local database;
- outbox/sync.

Do not load dashboard chart engines, export libraries, rich admin tables, or report pages into the POS critical bundle.

### POS-PERF-06 — Fonts

- Load only needed weights.
- Include complete Vietnamese subset.
- Preload the UI font required by the POS.
- Do not load the editorial serif on the POS critical path if it is not rendered.
- Avoid layout shift from mismatched fallback metrics.

---

## 14. Observability

Measure user journeys, not only API latency and FPS.

```text
Time to first sale-ready
Time to create order
Taps per completed order
Search-to-selection time
Quantity correction rate
Price correction rate
Held-cart resume success
Draft recovery rate
Sync latency
Conflict rate
Duplicate submission prevented
Order abandonment rate
Crash-free transaction sessions
```

Privacy rules:

- do not log sensitive free-form notes by default;
- do not log full payment or personal data unnecessarily;
- telemetry failure never blocks a transaction;
- event names distinguish local confirmation from server acceptance.

---

## 15. POS degraded states

Every transaction-critical screen defines:

```text
Loading
Empty
Partial data
Stale data
Offline
Unauthorized
Conflict
Server unavailable
Local storage full
Read-only mode
Maintenance
Peripheral unavailable
```

Rules:

- state copy says whether the active cart is safe;
- a server outage does not erase locally durable drafts;
- permission changes preserve data and block only prohibited commit;
- local storage full blocks unsafe confirmation;
- hardware failure offers a non-destructive fallback;
- stale price/debt/stock states remain visible through final review.

---

## 16. POS test matrix

Devices/layouts:

```text
360×640 phone
390×844 phone
412×915 phone
8-inch tablet
10-inch tablet landscape
Font scaling 125%, 150%, 200%
```

Failure scenarios:

```text
Network disappears during confirmation
User double-taps Confirm
App killed after local write
Server rejects stale credit/permission
Held cart resumed after price change
Two devices edit related records
Local storage nearly/full
Printer disconnects after commit
System keyboard opens inside cart sheet
User changes shift with unsynced operations
```

Acceptance requires:

- no duplicate transaction;
- no silent data loss;
- explicit local/server state;
- recoverable cart;
- accessible error and recovery path;
- interaction within budget on baseline device.

### Agent prompt

```text
Implement the requested mobile/tablet POS flow using design.md and MOBILE-POS.md.
Keep customer, debt freshness, active cart, total, and sync state visible.
Use stable product tiles, separated quantity/price modes, a domain keypad,
persistent held carts, one final consequence review, and durable idempotent commit.
Include offline, stale, conflict, storage-full, permission, crash-recovery,
and peripheral-failure states. Validate on the low-end device and volume fixtures.
```
