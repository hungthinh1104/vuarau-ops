# Supply Commitment use cases

## UC-SUPPLY-COMMITMENT-001 — Create and edit a draft

An authorized owner, accountant or warehouse worker records the Supplier,
product lines, quantity/unit, optional price, expected arrival, terms and source
references. The server validates workspace references and stores a draft. Edits
carry `expectedVersion`.

## UC-SUPPLY-COMMITMENT-002 — Confirm a commitment

The actor confirms a complete draft. The server requires a canonical Product on
every line, snapshots the current commercial values and moves the fact to
`confirmed`. No payable, Purchase or stock movement is created.

## UC-SUPPLY-COMMITMENT-003 — Cancel or supersede a commitment

The actor cancels with an explicit reason. A later correction creates a new draft
linked to the cancelled fact; the original remains readable and immutable.

## UC-SUPPLY-COMMITMENT-004 — View and list commitments

Authorized reads are workspace-scoped, deterministic and keyset-paged. A known
ID from another workspace is indistinguishable from a missing resource after
authorization fails.

## Acceptance boundary

The commitment records a commercial promise only. It must not be presented as a
Purchase, supplier payable, arrival, receipt, reorder result or supplier score.

Related: [rules](../04-business-rules/supply-commitment-rules.md),
[state machine](../03-state-machines/supply-commitment-state-machine.md),
[cases](../05-casebook/supply-commitment-cases.md).
