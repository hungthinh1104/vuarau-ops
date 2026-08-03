# Customer Order casebook

### CASE-CUSTOMER-ORDER-001 — Unpriced account order

A sales worker records a request for 12,5 kg cà chua before the customer accepts a
price. The system stores a draft with a null total and payment-term snapshot, and
no account entry or goods movement.

**Rules:** BR-CUSTOMER-ORDER-001, BR-CUSTOMER-ORDER-002 · **Tests:**
TC-CUSTOMER-ORDER-001

### CASE-CUSTOMER-ORDER-002 — Walk-in request without a fake customer

A walk-in customer asks for goods. The order uses `channel: walk_in` and
`customerId: null`. Supplying a Customer ID is rejected; the system never inserts
an anonymous Customer record as a workaround.

**Rules:** BR-CUSTOMER-ORDER-001 · **Tests:** TC-CUSTOMER-ORDER-001

### CASE-CUSTOMER-ORDER-003 — Confirmed priced order

The worker selects the catalogue Product and agrees 18.000 ₫/kg. Confirmation
calculates 225.000 ₫, stores the price and terms, increments the version, and
leaves debt and inventory unchanged.

**Rules:** BR-CUSTOMER-ORDER-002, BR-CUSTOMER-ORDER-005 · **Tests:**
TC-CUSTOMER-ORDER-002, TC-CUSTOMER-ORDER-004

### CASE-CUSTOMER-ORDER-004 — Stale edit and explicit cancellation

Two screens edit version 1. The second edit receives
`CUSTOMER_ORDER_VERSION_CONFLICT`. A later cancellation stores its reason and
leaves the order visible for a replacement; no compensation is invented.

**Rules:** BR-CUSTOMER-ORDER-003, BR-CUSTOMER-ORDER-004 · **Tests:**
TC-CUSTOMER-ORDER-003
