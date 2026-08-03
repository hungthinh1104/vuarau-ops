# UC-EVIDENCE-001 — Record a cost or loss observation

## Intent

An authorised worker records a cost, loss, quantity or participant statement that
was actually observed, together with at least one source reference. The record is
workspace-scoped, append-only and independently readable.

This use case captures evidence only. It does not recognise COGS, profit, payable,
receivable or inventory. Those meanings remain unavailable until the relevant
workspace policy is decided and implemented.

## Boundary

- `description` and `participantWording` preserve what was seen or said.
- `facts` uses exact money and scaled quantity values; missing values remain
  `null`, never zero.
- `evidenceReferences` must contain at least one source link.
- A correction is a new observation linked to an earlier observation in the same
  workspace; the earlier row is not edited.
- The command pipeline performs identity, workspace authorization, idempotency and
  transaction handling before persistence.

## Recovery and completeness

An identical retry returns the original result through the command receipt. A
wrong observation is corrected by a new `correction` row. A missing or foreign
correction target is rejected. The row is included in read pagination and logical
workspace backup.

## Explicit non-claims

This workflow does not choose a valuation basis, allocate a cost to stock, settle a
claim, change a ledger, or emit a management recommendation. Field validation and
the policy decisions in ASM-039–048 remain open.
