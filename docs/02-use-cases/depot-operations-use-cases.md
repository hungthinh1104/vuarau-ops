# Depot operations use cases

M23.14 decomposes Delivery and Document umbrella workflows into the actor goal that
owns each physical/control event. Technical evidence does not claim live-depot
validation, tax-invoice compliance, route optimisation, valuation or forecasting.

## UC-DELIVERY-001 — Draft, edit or cancel Sale fulfilment

**Actor:** owner/warehouse with Delivery create/update/cancel permissions.
**Trigger:** prepare a physical handover against immutable lines of a posted Sale.

- **State:** `∅ → draft`, versioned `draft → draft`, or `draft → cancelled`.
- **Guards:** Sale posted and not voided; exact canonical Product/QualityGrade/unit;
  quantity may not exceed currently remaining fulfilment.
- **Money/goods effect:** none until Dispatch. A draft/cancel does not move inventory
  and never changes customer debt.
- **Concurrency/retry:** optimistic draft version plus command idempotency.
- **UI:** editable draft, cancelled, permission denial, stale version, legacy line attention.
- **Rules/tests:** BR-DELIVERY-001/002/006/007 · TC-DELIVERY-001/002/003 · TC-E2E-030/032.

## UC-DELIVERY-002 — Dispatch goods

**Actor:** owner/warehouse. **Trigger:** goods physically leave accepted inventory.

- **Effect:** append one negative inventory movement per exact Product/grade/unit line;
  customer debt is unchanged.
- **Guards:** serialize against Sale/Delivery truth; cannot exceed remaining quantity;
  current negative-stock policy preserves rather than clamps attributable movement.
- **Unknown outcome:** lock a new dispatch intent and retry the identical command.
- **Correction:** a later real Return is UC-DELIVERY-004; never silently reverse Dispatch.
- **Rules/tests:** BR-DELIVERY-002/003/005/006/007 · TC-DELIVERY-001/002/003 · TC-E2E-030/032.

## UC-DELIVERY-003 — Acknowledge that dispatched goods were delivered

**Actor:** authorized delivery/warehouse role. **Trigger:** physical handover is acknowledged.

- **State:** `dispatched → delivered`.
- **Effects:** no new inventory movement and no customer-money effect; Dispatch already
  represented goods leaving inventory.
- **Correction/retry:** acknowledgement is idempotent; it must not be used to repair
  quantity. Physical Return is separate.
- **Rules/tests:** BR-DELIVERY-004/005 · TC-DELIVERY-001/002/003 · TC-E2E-030.

## UC-DELIVERY-004 — Record physical customer return

**Actor:** authorized warehouse/delivery role. **Trigger:** previously dispatched goods
physically return to accepted depot inventory.

- **Effect:** append positive Product/grade/unit movement referencing original Delivery;
  Delivery and Sale history remain immutable.
- **Money effect:** none by default. A physical return does not infer refund, debt
  reduction or exchange value; ASM-037 gates that business consequence. Only when
  canonical net fulfilment is zero may the separate full-Sale `goods_returned` void
  compensate the entire receivable.
- **Repeated action:** multiple genuine returns use fresh return identities; unknown
  outcome retries identical command identity.
- **Rules/tests:** BR-DELIVERY-003/004/005/006/007 · TC-DELIVERY-001/002/003 · TC-SALE-030 · TC-E2E-030/032.

## UC-DELIVERY-005 — Inspect Sale fulfilment

**Actor:** any role with Delivery read authority. **Trigger:** answer what was ordered,
dispatched, returned, effectively fulfilled and still remaining.

- **Read:** derived per Sale line from immutable Sale + Delivery + Return facts.
- **Integrity:** invalid legacy/missing Product or grade identity and impossible histories
  return `attention`; quantities are never guessed/clamped.
- **Correction boundary:** replacement Sale after prior fulfilment is ASM-035. Until
  resolved, do not manufacture physical movement to make replacement fulfilment look complete.
- **Rules/tests:** BR-DELIVERY-001/002/006/007 · TC-DELIVERY-001/003 · TC-E2E-030/032.

## UC-DOCUMENT-001 — Generate immutable source snapshot

**Actor:** authorized document generator. **Trigger:** produce Sale receipt, customer
statement, Purchase order or Delivery note from canonical source truth.

- **Effect:** next immutable document version with deterministic canonical digest;
  source transaction and prior versions are unchanged.
- **Multi-day statement:** an optional inclusive Vietnam-time period groups existing
  customer-ledger entries. Opening balance, signed period change and closing balance
  are server-derived; the statement does not merge Sales/Payments or allocate one
  Payment across Sales.
- **Presentation:** authenticated and public reads render the typed snapshot as a
  print-ready table with source references, version, digest and a non-tax disclaimer.
  Legacy snapshots remain readable through an explicit fallback.
- **Integrity:** authenticated read re-verifies digest; restore rejects mismatch atomically.
- **Correction:** regenerate a new version; never edit an issued snapshot in place.
- **Rules/tests:** BR-DOCUMENT-001/002/004/005 · TC-DOCUMENT-001/002/003.

## UC-DOCUMENT-002 — Share and revoke a document snapshot

**Actor:** authorized document-sharing role. **Trigger:** give a recipient temporary
read access to one frozen snapshot.

- **Security:** creator receives random token; storage keeps only hash. New shares
  are finite; omitted expiry becomes 24 hours server-side. Expired, revoked,
  unknown or digest-invalid token fails closed.
- **State:** share available → expired or revoked; expiry is derived from time.
- **Effects:** no commercial, money or goods mutation.
- **Policy:** real customer data remains blocked until ASM-030 policy is approved.
- **Rules/tests:** BR-DOCUMENT-002/003/004, BR-OPS-005 · TC-DOCUMENT-001/002.

## UC-DOCUMENT-003 — Read and validate a document snapshot

**Actor:** authenticated member or token-bearing public recipient within the share boundary.
**Trigger:** inspect a frozen business snapshot and verify it still matches its digest.

- **Read:** authenticated path checks workspace permission; public path is token-scoped only.
- **Failure:** digest mismatch, expiry/revocation or unknown token returns no trusted document.
- **Effect:** none; a read never changes the source transaction or snapshot.
- **Rules/tests:** BR-DOCUMENT-002/003/004, BR-OPS-005 · TC-DOCUMENT-001/002.

## UC-REPORT-001 — Inspect source-backed operational reports

**Actor:** authorized report reader. **Trigger:** inspect customer activity,
receivables, supplier payables, grade-aware inventory/movements or outstanding Delivery.

- **Truth:** rows/totals derive from canonical ledgers/movements, never become a second
  source. Business dates use `transactionTime` in `Asia/Ho_Chi_Minh`.
- **Identity:** inventory stays Product + QualityGrade + unit. Cross-grade totals are
  explicitly informational aggregation, not a canonical balance.
- **Navigation:** each applicable row links to its source transaction; legacy source
  limitations remain visible rather than invented.
- **Integrity:** healthy/attention is explicit; read failure never becomes stale “current” totals.
- **Metric availability:** `report.metrics` exposes policy-blocked candidates as
  `unavailable` with their ASM gates; the Reports screen renders those gates and
  next evidence, and it never supplies zero or inferred values.
- **CSV:** representation of the same server read, not a separate calculation.
- **Rules/tests:** BR-REPORT-001…005, BR-OPS-005/007 · TC-REPORT-001/002/003 · TC-E2E-030.
