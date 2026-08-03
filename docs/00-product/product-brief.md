# Product brief — the configurable fresh-produce operating system

**vuarau-ops** records and explains fresh-produce operations across production
regions, wholesale markets, regional hubs and contract distribution chains.

It is not a general ERP, accounting package, or warehouse-management suite. Its
job is narrower and stricter: capture operational facts quickly, preserve the
commercial, money, and goods truth that resulted, and apply a workspace's
explicit policy without erasing history or guessing an effect that did not occur.

The product does not assume one national depot pattern. Operating hours, channels,
source, packing, transport responsibility, recognition, payment terms, valuation,
planning and close routines are workspace policy questions, not global defaults.

## Who uses it

| Persona          | Working context                                  | What they need                                                                                      |
| ---------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Owner            | Oversees the depot and settles disputes          | Explain customer debt, supplier payable, inventory, corrections, reports and recovery               |
| Accountant       | Records and reconciles money                     | Exact payments, reversals, adjustments, source links and attributable audit evidence                |
| Sales worker     | Agrees and records customer sales                | Fast multi-line Sale capture, safe retry, explicit last-price reuse and clear correction boundaries |
| Warehouse worker | Receives, counts, dispatches and accepts returns | Product/unit accuracy, attributable movements and no hidden money effect                            |
| Delivery worker  | Carries goods and records fulfilment facts       | Clear dispatch/return assignments without authority to change commercial or money truth             |

These role boundaries are technically enforced. Their fit with each depot remains
field-unvalidated until ASM-017 and the relevant validation hypotheses are closed.

## The operating model

The universal vocabulary is a chain of distinct facts:

```text
Demand / Customer Order → Supply Commitment → Arrival → Weighing / Inspection
→ Acceptance / Rejection / Quarantine → Grading / Packing → Allocation
→ Loading / Dispatch → Delivery / Handover → Receivable / Payable / Payment
→ Return / Claim / Reconciliation
```

The chain is implemented incrementally. A command must not collapse multiple
states simply because they often happen together in one operation.

### The three truth dimensions

#### Money Truth

Customer Sale posting, customer Payment, reversal, void, replacement and debt
adjustment produce an append-only customer account history. Purchase confirmation,
supplier Payment, reversal, Purchase void and supplier adjustment do the same for
supplier accounts. Every total must resolve to canonical, attributable sources.

#### Goods Flow

Products, workspace QualityGrades and units anchor Purchase Receiving, receipt
reversal, inventory adjustment/reclassification, Sale Delivery, dispatch and
return. Where a workspace needs them, Source and Packing specification are also
first-class identity dimensions. Grade belongs to physical quantity rather than
Product identity. Physical movement remains separate from the commercial
agreement and from customer or supplier money.

#### Operational Control

Workspace membership and capabilities, audit, immutable generated documents,
controlled sharing, source-backed reports, export, restore, reconciliation and
integrity checks let the depot operate and recover without rewriting canonical
history.

The cross-context rules are explicit in
[product-invariants.md](product-invariants.md).

## Why this is hard

- **The network is unreliable.** A retry after a dropped response must resolve the
  same command, not duplicate a Sale, payment, movement, document, or account
  effect.
- **Recorded time is not transaction time.** Business ordering and historical
  balances must use the event's business time and a deterministic tie-break.
- **Money and goods are contested.** Every effect needs one actor, command, source
  and correction path.
- **Vietnamese units are irregular.** kg, gram, lạng, bó, thùng, rổ, kiện and cái
  are not interchangeable unless an explicit future policy says they are.
- **Đồng and quantities must be exact.** Floating-point arithmetic is disqualified
  from canonical effects.
- **Recognition policy matters.** The software currently recognizes customer debt
  at `PostSale` and supplier payable at `ConfirmPurchase`; owner validation is
  still required by ASM-024 and ASM-025.

## What good looks like

The statements below deliberately separate implementation evidence from product
evidence.

### Technically proven

- Quick Sale, explicit price recall, payment, reversal, correction and account
  explanation use typed commands and source-linked PostgreSQL records.
- Purchase confirmation, Receiving/reversal, inventory movement,
  Dispatch/Return and supplier-account operations keep commercial, financial and
  physical facts separate.
- Documents are immutable snapshots whose authenticated reads verify their
  digests; shares are revocable and expiry-aware.
- Export/restore, projection rebuilds, reconciliation and integrity checks have
  automated technical evidence, including transactional restore.
- Duplicate-safe command receipts and offline Quick Sale synchronization preserve
  one canonical effect for one command.

### Field-validated

No workflow is yet claimed as field-validated. No real depot observation has
proved that the implemented recognition moments, role split, speed, terminology,
document sharing, or recovery procedure fit daily work.

### Still hypothetical

- A sales worker records a correct multi-line Sale unaided at depot pace.
- A warehouse or delivery worker records Receiving, Dispatch and Return accurately
  without mixing goods facts with money.
- An owner can explain customer debt, supplier payable and inventory from source
  documents without developer help.
- An owner can share an appropriate document and complete export/restore under an
  approved retention and recovery policy.
- The current `PostSale` and `ConfirmPurchase` recognition moments match depot
  commercial practice.

These claims are measured by H2–H6 in
[validation-plan.md](validation-plan.md), not by treating a green test suite as
field evidence.

## Delivered boundary

The technical workflow surface through the current technical candidate is
implemented across the three truth dimensions:

```text
Customer → Sale → customer account → Payment/correction
Supplier → Purchase → supplier account → Receiving → Inventory
Sale → Delivery → Return
Canonical sources → Documents/shares/reports → Export/restore/integrity
```

The full product vocabulary also recognizes packing, allocation, loading, handover,
claims, cost observations and operational reconciliation. Those are added as
separate facts when a workspace needs them; the current runtime must not imply
that an existing Arrival or Delivery command already represents every stage.

M21.6 closes product-policy classification, vision, catalog and traceability
gaps. It adds no runtime behavior and does not open M22.

The authoritative command/query inventory lives in
[command-contracts.md](../06-api-contracts/command-contracts.md),
[read-models.md](../06-api-contracts/read-models.md), and the
[use-case catalog](../02-use-cases/use-case-catalog.md). The
[scope](scope.md) records the delivered boundary without confusing it with field
validation.

## Current validation phase

H1, backend/browser integration safety, has technical evidence on the real stack.
H2–H6 remain field hypotheses. ASM-024 and ASM-025 are mandatory owner-validation
actions before real Sale posting or Purchase confirmation because a contrary
answer would change money-recognition semantics.

See:

- [validation-plan.md](validation-plan.md)
- [decision-backlog.md](../09-decisions/decision-backlog.md)
- [roadmap.md](roadmap.md)
- [scope.md](scope.md)
