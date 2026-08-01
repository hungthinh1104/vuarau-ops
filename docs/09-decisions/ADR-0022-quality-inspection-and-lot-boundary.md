# ADR-0022 — Commercial grade is not a quality-management system

**Status:** proposed · 2026-08-01

## Context

When ADR-0024 selects required commercial grading, the current model preserves `QualityGrade` through Purchase Receiving, inventory, Sale, Delivery, Return and reclassification. A depot may instead select ungraded physical quantity; that choice does not create an inspection system. That answers a commercial question:
"Loại 1 or Loại 2?" It does not answer operational quality questions such as:

- which incoming load or source lot this quantity came from;
- what was inspected, by whom and when;
- which defect/condition was observed and with what evidence;
- how much was accepted, downgraded, quarantined, rejected or disposed;
- whether rejected goods affect Supplier payable or create a claim;
- which accepted lot was later delivered or recalled.

Adding fields such as `damaged: true` to `QualityGrade`, Product or Receipt would
collapse vocabulary, observation and disposition into one mutable label. It would
also make "quality" appear complete while the physical and supplier-money effects
remain undefined.

## Proposed decision

Model quality as four separate concepts:

1. **Quality vocabulary** — workspace-managed condition/defect codes. These are not
   Product and not commercial Grade.
2. **Goods arrival / source lot** — an attributable incoming physical load, normally
   linked to Supplier and Purchase where known. It records arrived Product,
   quantity, unit, source references, optional supplier lot/code and arrival time.
   Arrival itself does not yet mean accepted inventory.
3. **Quality inspection** — append-only observations against an arrival line or an
   accepted lot: inspected quantity, condition/defect codes, note, inspector and
   optional evidence references. Inspection records what was seen; it moves no
   money or stock by itself.
4. **Disposition** — an authorized allocation of inspected/arrived quantity into
   explicit outcomes:
   - `accepted` with commercial QualityGrade;
   - `regraded` where a different accepted grade is chosen;
   - `quarantined` and therefore unavailable for Sale/Delivery;
   - `rejected` before acceptance;
   - `returned_to_supplier` after a truthful outbound event;
   - `disposed` or `loss` with attributable physical effect.

Only disposition may cross a physical boundary. Accepted quantity creates or
references the canonical Receipt/inventory movement. Quarantined quantity is a
separate non-sellable physical bucket. Rejected quantity is never inserted into
accepted inventory merely to make ordered and received numbers match.

## Lot identity

An accepted `GoodsLot` is a traceability identity, not an inventory balance key
replacement. Canonical stock remains exact by workspace + Product + commercial
Grade + unit; lot-level movements explain which source quantity contributed.

If field evidence shows workers never identify lots and traceability has no value,
lot capture may remain optional. The software must not generate fake lot codes that
workers cannot recognize. When a lot is present, later split, merge, regrade,
Delivery and Return movements retain source lineage rather than rewriting the lot.

## Invariants

- Sum of dispositions may not exceed arrived quantity per exact Product/unit line.
- Accepted + quarantined + rejected + returned/disposed allocations remain
  attributable; no quantity silently disappears between states.
- Inspection cannot directly alter inventory or Supplier payable.
- Commercial Grade cannot encode defect, quarantine or approval state.
- A photo/evidence reference supports an observation but is not the authority that
  moves stock.
- Reclassifying accepted Grade conserves physical quantity and does not rewrite the
  original inspection.
- Supplier credit/refund/claim is a separate Money Truth command linked to the
  quality event only after ASM-033/038 policy is decided.
- Sale and Delivery may consume only accepted, non-quarantined quantity under the
  chosen lot-allocation policy.
- Correction is append-only: correct an inspection/disposition with an attributable
  compensation or superseding decision, never edit historical evidence in place.

## Permissions

Do not reuse `quality.manage` for every quality action. Candidate permissions are:

- `quality.vocabulary.manage` — maintain defect/condition vocabulary;
- `quality.inspect` — record observations;
- `quality.disposition` — accept, quarantine, reject or dispose quantity;
- `quality.override` — exceptional owner-reviewed correction where required.

The owner must decide role mapping, segregation of duties, approval thresholds and
required evidence. Multi-role composition is covered separately by ADR-0021.

## Delivery sequence

1. Close ASM-032/033/034 and ASM-038 with real examples.
2. Add casebook scenarios for partial acceptance, downgrade, quarantine, rejected
   arrival and later Supplier return.
3. Introduce arrival/inspection/disposition contracts and domain decisions before
   changing Receipt semantics.
4. Add source-linked lot/quarantine movements and reconciliation.
5. Add mobile capture and evidence upload only after the command semantics are
   stable.
6. Prove backup/restore, permissions, retry, concurrency, reports and print
   presentation before pilot use.

## Alternatives considered

| Alternative                                          | Why rejected                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Add more values to QualityGrade                      | Mixes commercial value with physical condition and approval state.                                 |
| Put `condition` directly on inventory balance        | Creates a mutable classification projection without inspection/disposition history.                |
| Treat every damaged arrival as a negative adjustment | Loses Supplier/Purchase/arrival lineage and falsely implies it had already entered accepted stock. |
| Treat Receipt reversal as Supplier return            | Corrects a recording fact rather than representing later physical movement and money consequence.  |

## Consequences

- Quality capture becomes a source-linked workflow rather than extra fields on
  Product/Grade/Receipt.
- More physical states and permissions must be reconciled, backed up and presented.
- The current Grade-aware inventory remains valid; this proposal extends rather
  than rewrites its commercial classification.
- Implementation is intentionally blocked until field examples decide acceptance,
  quarantine and Supplier-money consequences.

## Revisit when

Revisit after ASM-032/033/034/038 interviews produce concrete damaged-arrival,
partial-acceptance and Supplier-return examples, or if field evidence shows lot
traceability has no operational value for the pilot.

## Related

- [quality policy worksheet](m23-quality-policy-worksheet.md)
- [ADR-0019](ADR-0019-separate-supplier-and-inventory-ledgers.md)
- [Goods Truth rules](../04-business-rules/goods-flow-rules.md)
- [cross-dimension worksheet](m23-cross-dimension-correction-worksheet.md)
