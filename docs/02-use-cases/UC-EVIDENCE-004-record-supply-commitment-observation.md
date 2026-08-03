# UC-EVIDENCE-004 — Record and review a source-linked supply commitment observation

## Intent

An authorized worker records what a supplier, farmer, collector or other
counterparty said about available supply, a promised quantity, a minimum order
or an expected arrival. The record remains attributable and correctable without
turning an expectation into a purchase, payable, receipt, inventory balance,
reorder signal or supplier score.

## Contract

- `evidence.recordSupplyCommitmentObservation` requires a source reference,
  preserves exact participant wording and keeps unknown supplier/product
  identity as `null` while retaining a free-text counterparty label.
- The command is workspace-scoped, authorized before mutation, idempotent and
  append-only. A correction is a new observation linked to an earlier one in
  the same workspace.
- `evidence.getSupplyCommitmentObservation` and
  `evidence.listSupplyCommitmentObservations` return the stored facts in
  deterministic recorded-time order.
- The observation does not create a Purchase, SupplierAccountEntry,
  PurchaseReceipt, InventoryMovement, reorder state or supplier evaluation.
- Backup V15 includes the observation. V1–V14 restore with an empty supply
  commitment collection, and restore validates workspace, master-identity and
  correction references before commit.

The authenticated Web Admin exposes `/evidence/supply` to `evidence.read`
users. Workers with `evidence.record` may record a new observation from the
same screen. The screen states the fact-only boundary explicitly.

## Deliberate boundary

This use case does not decide supplier roles, approved minimums, lead time,
availability confidence, purchase commitments, payable recognition, reorder
thresholds, supplier performance or recommendations. Those remain field and
policy gates, including ASM-042, ASM-047 and ASM-048.

## Evidence state

`Proposed → Policy Decided → Technically Implemented → Repository Verified` is
complete for the raw fact-capture contract. `Field Validated` and `Production
Accepted` remain open.
