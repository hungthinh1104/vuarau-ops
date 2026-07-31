# Goods Truth use cases

M23.14 decomposes the former Supplier/Purchase/Receiving/Inventory umbrella rows
into actor-visible goals. The original `*-001` identifiers remain assigned to a
subset of their original meaning; no ID is reused for an unrelated workflow.
Every use case below keeps commercial, supplier-money and physical truth separate.

## UC-PRODUCT-001 — Manage and identify Product catalogue

**Actor:** owner for lifecycle; operational roles for read/search. **Risk:** P0
where canonical Product identity affects fulfilment. **Trigger:** create/rename/
deactivate a Product, or select one during transaction capture.

- **Permission:** `product.manage` mutations; published read permission for search/get.
- **Happy path:** create/update/deactivate/reactivate versioned workspace Product;
  search keeps duplicate names as distinct identities. Product stores no price or stock.
- **Correction:** catalogue edits never rewrite Sale/Purchase/history snapshots.
  Legacy null Product identity stays unresolved; no name→id backfill is allowed.
- **Concurrency/retry:** versioned mutation + normal command idempotency; stale
  lifecycle intent reloads rather than auto-bumping a version.
- **Money/goods effect:** none directly. Product is identity used by later commands.
- **Offline:** catalogue mutation is online-only; cached search must show age where used.
- **UI:** duplicate-name candidates, inactive state, stale version, permission denial,
  historical unresolved identity.
- **Rules/tests:** BR-PRODUCT-001…005 · TC-PRODUCT-001…003.

## UC-QUALITY-001 — Manage commercial grade vocabulary

**Actor:** owner/warehouse under the current role default. **Trigger:** maintain the
workspace's commercial classification vocabulary used by accepted physical quantity.

- **Permission:** `quality.read` for reads, `quality.manage` for lifecycle.
- **Happy path:** create, rename/reorder, deactivate and reactivate a versioned
  `QualityGrade`; no hard delete. Historical snapshots retain their original name/id.
- **Correction:** changing the grade of existing stock is **not** master-data edit;
  use UC-INVENTORY-003 reclassification.
- **Effects:** no money or inventory movement from vocabulary maintenance itself.
- **Policy:** Grade is not Condition/Defect/inspection. Universal grade requirement
  and authority remain ASM-032/034 field gates.
- **UI/recovery:** read-only role, inactive grades, stale version, unknown outcome.
- **Rules/tests:** BR-INVENTORY-010 · TC-QUALITY-001 · TC-E2E-032.

## UC-SUPPLIER-001 — Manage Supplier master data

**Actor:** owner/accountant for lifecycle; warehouse may identify/read Suppliers.
**Trigger:** a trading Supplier is created, corrected, deactivated or restored.

- **Permission:** supplier lifecycle permissions; server remains workspace authority.
- **State:** active/inactive versioned identity; deactivation never deletes payable history.
- **Effects:** no money or goods movement merely from changing Supplier master data.
- **Concurrency/retry:** optimistic version + command idempotency.
- **UI:** search/read, inactive state, stale version, permission denial.
- **Rules/tests:** BR-SUPPLIER-001 · TC-GOODS-002 · TC-E2E-029.

## UC-SUPPLIER-002 — Record and reverse Supplier payment

**Actor:** owner/accountant. **Trigger:** depot pays Supplier, or later proves part/all
of that payment record wrong.

- **Money effect:** payment appends one negative supplier-ledger entry; partial/full
  reversal appends a positive compensation referencing the original payment.
- **Goods effect:** none. Payment never implies Receiving or stock movement.
- **Alternatives:** overpayment is valid supplier credit; reversal cannot exceed the
  remaining reversible amount.
- **Repeated action:** separate real payments/reversals use fresh business identities;
  unknown outcome retries the identical command identity.
- **Reconciliation:** supplier timeline explains both original and compensation.
- **Rules/tests:** BR-SUPPLIER-002, BR-SUPPLIER-003 · TC-GOODS-001/002.

## UC-SUPPLIER-003 — Adjust Supplier account without a Purchase

**Actor:** owner/accountant. **Trigger:** opening balance, settlement or other payable
fact that has no Purchase source.

- **Input:** explicit direction, positive amount, reason code and nonblank explanation.
- **Money effect:** one attributable supplier-ledger entry; **goods effect:** none.
- **Guard:** this is not a shortcut for correcting a wrong Purchase or Supplier return.
- **Correction/retry:** a later correction is another explained account fact; unknown
  outcome reuses the identical command.
- **Rules/tests:** BR-SUPPLIER-002, BR-SUPPLIER-004 · TC-GOODS-001/002.

## UC-SUPPLIER-004 — Explain, reconcile and rebuild Supplier payable

**Actor:** supplier-account reader; owner/accountant for rebuild. **Trigger:** explain a
payable or investigate projection drift.

- **Read:** balance/timeline/reconciliation are source-linked and sign-classified.
- **Rebuild:** only projection-only drift may be rebuilt; malformed/missing canonical
  source refuses repair. Rebuild appends no supplier-money fact.
- **Offline:** cacheable reads must expose age; rebuild is online-only.
- **UI:** payable/settled/supplier-credit, consistent/inconsistent/integrity-failure.
- **Rules/tests:** BR-SUPPLIER-002, BR-SUPPLIER-005 · TC-GOODS-001/002 · TC-E2E-029.

## UC-PURCHASE-001 — Draft, edit and discard a Purchase

**Actor:** owner/accountant/warehouse according to current permission table.
**Trigger:** begin recording an intended Supplier purchase before financial recognition.

- **State:** `∅ → draft`, versioned draft edits, or `draft → discarded`.
- **Money/goods effect:** none. Drafting/discarding neither creates payable nor stock.
- **Inputs:** immutable line identities with canonical Product snapshots and exact money.
- **Concurrency/retry:** whole-draft optimistic version; no silent merge; idempotent create.
- **Offline:** not queued in current scope.
- **Rules/tests:** BR-PURCHASE-001, BR-PURCHASE-002 · TC-GOODS-003 · TC-E2E-029.

## UC-PURCHASE-002 — Confirm a Purchase

**Actor:** owner/accountant. **Trigger:** depot accepts the commercial Purchase under
ASM-025 recognition policy.

- **State:** `draft → confirmed`; confirmed snapshot becomes immutable.
- **Money effect:** exactly one supplier payable `+total`; **goods effect:** none.
- **Guards:** active Supplier, exact arithmetic, current version, valid stored draft.
- **Unknown outcome:** retry identical confirmation; never create a second payable.
- **Policy:** ASM-025 must validate that confirmation is the depot's payable moment.
- **Rules/tests:** BR-PURCHASE-001…003 · TC-GOODS-001/003 · TC-E2E-029.

## UC-PURCHASE-003 — View Purchase and Receiving progress

**Actor:** authorized purchasing/warehouse roles. **Trigger:** inspect a Purchase,
what has been accepted and what remains.

- **Read:** immutable Purchase snapshot plus source-derived Receiving progress; a
  confirmed Purchase is not mutated into a `received` lifecycle status.
- **Effects:** none. A read does not infer payable or inventory changes.
- **Integrity:** quantities remain by Purchase line; accepted stock is explained by Receipts.
- **UI:** draft/confirmed/discarded/voided, partial/complete Receiving, source links.
- **Rules/tests:** BR-PURCHASE-001, BR-INVENTORY-002, BR-READ-001/002 · TC-GOODS-001 · TC-E2E-029.

## UC-PURCHASE-004 — Void and optionally replace a confirmed Purchase

**Actor:** owner/accountant. **Trigger:** confirmed commercial document is wrong.

- **Correction:** append Purchase void with supplier payable `-original total`; optional
  replacement is a fresh Purchase linked to the voided original.
- **Guard:** a Purchase with net active Receipts cannot currently be voided.
- **Goods effect:** none. Commercial correction must not manufacture inventory movement.
- **Cross-dimension stop:** correction after accepted Receiving is ASM-036; do not
  reverse/re-receive goods that did not physically move.
- **Rules/tests:** BR-PURCHASE-004…006 · TC-GOODS-001/003 · TC-E2E-029.

## UC-RECEIVING-001 — Record accepted physical goods

**Actor:** owner/warehouse receiver. **Trigger:** confirmed-Purchase goods cross the
accepted-inventory boundary.

- **Input/effect:** one or more partial Receipt lines, split across configured grades;
  each accepted Product/grade/unit quantity appends one positive inventory movement.
- **Guards:** confirmed Purchase, exact Product/unit, active grade under current policy,
  and cumulative accepted quantity not above purchased quantity.
- **Money effect:** none; Receiving never moves supplier payable.
- **Repeated action/retry:** multiple genuine Receipts use fresh receipt/line identities;
  unknown outcome retries the same Receipt command and cannot duplicate movement.
- **Policy stop:** rejected/damaged arrival is not accepted stock; ASM-033 governs that gap.
- **Rules/tests:** BR-INVENTORY-001…003, BR-INVENTORY-010 · TC-GOODS-001/004 · TC-E2E-029/032.

## UC-RECEIVING-002 — Reverse a wrongly recorded Receipt

**Actor:** owner/warehouse with receiving reversal authority. **Trigger:** a Receipt
record itself was wrong, not a later real Supplier return.

- **Correction/effect:** append one reversal and exact negative compensation for each
  original Receipt movement; original Receipt remains visible.
- **Money effect:** none. Reversal does not edit Purchase payable.
- **Guard:** reversal is correction of recording truth; it must not represent stock
  physically returned to Supplier later (ASM-038).
- **Retry:** duplicate-safe; a second legitimate reversal is not allowed for the same fact.
- **Rules/tests:** BR-INVENTORY-003/004 · TC-GOODS-001/004 · TC-E2E-029.

## UC-RECEIVING-003 — Inspect Receiving progress

**Actor:** purchasing/warehouse readers. **Trigger:** ask how much of each Purchase line
has actually been accepted and what remains.

- **Read:** ordered, net accepted and remaining quantity from Receipt/reversal facts;
  grade splits roll up only for Purchase-line progress, not canonical inventory identity.
- **State/effects:** derived read only; no `received` mutation on Purchase.
- **Integrity:** over-received/invalid source history is not silently clamped.
- **Rules/tests:** BR-INVENTORY-002/004/005 · TC-GOODS-001/004 · TC-E2E-029/032.

## UC-INVENTORY-001 — Inspect inventory balance and movement history

**Actor:** authorized inventory readers. **Trigger:** answer “how much is here and why?”.

- **Read:** independent balance per workspace + Product + QualityGrade + unit and an
  attributable movement timeline ordered by transactionTime/recordedAt/id.
- **State:** positive/zero/negative are retained classifications; incompatible units or
  grades are never merged in canonical rows.
- **Recovery:** source navigation and reconciliation explain anomalies; a failed read is
  not interpreted as healthy or zero.
- **Rules/tests:** BR-INVENTORY-005/006/008/009 · TC-GOODS-001/005 · TC-E2E-029/032.

## UC-INVENTORY-002 — Record explained physical adjustment

**Actor:** owner/warehouse. **Trigger:** stocktake discrepancy, spoilage, loss, gift or
weighing correction that is a real physical fact and has no better source document.

- **Input/effect:** explicit direction, positive exact Product/grade/unit quantity,
  reason code and explanation; append one attributable movement.
- **Money effect:** none. Adjustment is not Sale, Receipt, Delivery or Supplier credit.
- **Correction/repeat:** every newly observed fact uses a fresh adjustment identity;
  an unknown outcome locks new intent and retries the identical command.
- **Rules/tests:** BR-INVENTORY-007, BR-INVENTORY-012 · TC-GOODS-004 · TC-E2E-032.

## UC-INVENTORY-003 — Reclassify accepted stock between grades

**Actor:** owner/warehouse under current ASM-034 authority. **Trigger:** accepted stock
is commercially reclassified without changing Product or unit.

- **Effect:** one atomic negative source-grade movement plus equal positive destination-
  grade movement; total physical quantity is conserved.
- **Money effect:** none. Historical Receipt/Sale/Delivery grade snapshots are untouched.
- **Guards:** active grades, positive quantity, reason/actor, exact Product/unit.
- **Policy:** authority/approval remains owner-validation gate ASM-034.
- **Rules/tests:** BR-INVENTORY-005, BR-INVENTORY-010/011 · TC-QUALITY-001 · TC-E2E-032.

## UC-INVENTORY-004 — Reconcile and rebuild inventory projection

**Actor:** inventory reader; owner for rebuild. **Trigger:** investigate a projected
balance that may not match canonical movement history.

- **Read:** compare canonical movement sum/source integrity with disposable balance.
- **Rebuild:** only projection-only drift may be replaced from healthy canonical facts;
  missing/duplicate/malformed sources refuse repair.
- **Effect:** rebuild appends no physical movement and changes no customer/supplier money.
- **Concurrency/offline:** consistent server transaction; online-only recovery action.
- **UI:** consistent/inconsistent/not-found/integrity-failure with source diagnostics.
- **Rules/tests:** BR-INVENTORY-005/006/008 · TC-GOODS-001/004 · TC-E2E-029/032.

## Known Goods Truth stops

The following are **not** silently folded into the use cases above:

- rejected/damaged goods before acceptance — ASM-033;
- Purchase replacement after already-accepted Receiving — ASM-036;
- customer Return financial consequence — ASM-037;
- return of previously accepted stock to Supplier — ASM-038.

See [use-case-completeness-audit.md](use-case-completeness-audit.md) and the
[cross-dimension worksheet](../09-decisions/m23-cross-dimension-correction-worksheet.md).
