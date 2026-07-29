# Depot operations use cases

These use cases close M19–M21 with technical evidence. They do not claim live
depot validation, tax-invoice compliance, route optimisation, valuation, or
forecasting.

## UC-DELIVERY-001 — Fulfil a posted Sale

An owner or warehouse worker creates one or more Delivery drafts against
immutable Sale lines, dispatches exact Product/unit quantities, marks the
delivery complete, and records explicit returns.

- **Preconditions:** the Sale is posted; every outbound line has a Product; a
  replacement whose predecessor has active net fulfilment is rejected.
- **Permission:** `delivery.create`, `delivery.update`, `delivery.cancel`,
  `delivery.dispatch`, `delivery.complete`, or `delivery.return`, according to
  the operation.
- **State:** `draft → dispatched → delivered`, or `draft → cancelled`. A return
  is an appended compensation and never rewrites the Delivery.
- **Account effect:** none. Dispatch and return move inventory only.
- **Idempotency and concurrency:** retry replays the command receipt. Dispatch
  serializes on the Sale and cannot exceed remaining Sale quantity.
- **Offline:** not supported in M19.
- **UI states:** loading, permission denied, rejected command, unknown outcome,
  retry, and source-detail navigation.

## UC-DOCUMENT-001 — Generate and securely share a snapshot

An authorized worker generates `sale_receipt`, `customer_statement`,
`purchase_order`, or `delivery_note` from canonical sources. Regeneration creates
a new immutable version with a deterministic digest.

Only a random token is returned to the creator; storage retains its hash. A
public reader can only view the frozen snapshot while the share is active.
Expiry, revocation, missing token, and digest mismatch fail closed. Generation
and sharing never mutate the source transaction.

## UC-REPORT-001 — Inspect source-backed operational reports

An authorized worker reads daily operations, customer receivables, supplier
payables, inventory by Product/unit, inventory movements, and outstanding
delivery.

Business dates use `transactionTime` in the explicit Vietnam timezone.
Incompatible units remain separate. Totals and rows come from canonical ledgers
or movements, use deterministic cursor pagination, expose integrity state, and
link to their source documents. CSV is a representation of the same server read,
not a second calculation.
