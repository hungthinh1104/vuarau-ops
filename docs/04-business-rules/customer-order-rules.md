# Customer Order rules

`CustomerOrder` is a commercial request. It is not a Sale, invoice, receivable,
allocation, delivery or inventory record. A workspace may use it before a Sale or
skip it and create a Sale directly.

### BR-CUSTOMER-ORDER-001 — channels and customer identity

The channel is stored on the order. `account_customer` and `contract_customer`
require a real workspace Customer. `walk_in` and `internal_transfer` must have a
null `customerId`; the system must never create a fake customer to satisfy the
foreign key.

### BR-CUSTOMER-ORDER-002 — confirmation snapshots the agreement

A draft may be empty, unresolved or unpriced while a worker is negotiating. A
confirmed order must have at least one line, a canonical Product on every line,
an integer positive quantity and a non-negative agreed unit price in the order
currency. The line price, line total and optional payment-term snapshot are
copied into the order and are not read from a later catalogue or policy version.

Confirmation calculates the total from integer quantity and integer money. It
creates no account entry, inventory movement, fulfilment fact or cash movement.

### BR-CUSTOMER-ORDER-003 — optimistic lifecycle

Every edit, confirmation and cancellation carries `expectedVersion`. A mismatch
returns `CUSTOMER_ORDER_VERSION_CONFLICT` before a mutation. A confirmed order is
immutable; cancellation is an explicit, reasoned lifecycle decision and does not
pretend that a Sale or financial compensation occurred.

### BR-CUSTOMER-ORDER-004 — correction by supersession

Correction does not edit a confirmed order. A replacement draft may reference one
cancelled order through `replacesCustomerOrderId`. The application permits at most
one successor and keeps both records visible. This link has no money or goods
effect; later Sale or fulfilment commands must make their own explicit links.

### BR-CUSTOMER-ORDER-005 — workspace and command integrity

All commands and reads are workspace-scoped and pass through the shared
authorization, idempotency, audit and transaction pipeline. A retried command
returns its stored result and does not create another order or audit effect.

## Related

- [customer-order state machine](../03-state-machines/customer-order-state-machine.md)
- [customer order use cases](../02-use-cases/customer-order-use-cases.md)
- [customer order cases](../05-casebook/customer-order-cases.md)
- [trace map](../08-qa/trace-map.yml)
