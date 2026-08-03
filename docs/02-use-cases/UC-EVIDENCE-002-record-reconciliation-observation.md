# UC-EVIDENCE-002 — Record an operational reconciliation observation

## Intent

An authorised worker records what a source says should be present and what was
observed in the field: cash, inventory, outstanding work, packing, claims or a
statement reference. The observation is workspace-scoped, append-only and
source-linked.

This workflow captures evidence only. It does not calculate a variance, approve
a close, match a bank statement, change cash/debt/payable or create an inventory
movement. Those meanings remain blocked until the relevant workspace policy and
canonical effect are explicitly decided.

## Boundary

- `expectedAmount` and `observedAmount` are separate exact money facts.
- `expectedQuantity` and `observedQuantity` are separate scaled quantity facts;
  either side may be absent and missing stays `null`, never zero.
- `itemCount`, `scopeReference`, participant wording and description preserve
  what the worker can support from the source.
- `evidenceReferences` must contain at least one source link.
- A correction is a new observation linked to an earlier observation in the same
  workspace; the earlier row is never edited.
- The shared command pipeline performs identity, workspace authorization,
  idempotency and transaction handling before persistence.

## Recovery and completeness

An identical retry returns the original result through the command receipt. A
foreign or missing correction target is rejected. The observation is paginated,
included in logical backup/restore and does not alter canonical ledger or
inventory counts.

## Explicit non-claims

This workflow does not define a variance formula, stocktake session, close state,
bank settlement, payable/receivable adjustment or management recommendation.
ASM-043 remains a field-policy gate. Close and statement-match commands are separate
typed adapters that require their own approved policies; this observation command
still never creates a close, settlement, cash, debt, payable or inventory effect.
