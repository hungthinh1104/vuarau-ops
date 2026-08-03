# UC-EVIDENCE-005 — Record and review supplier observations

## Outcome

An authorized workspace member records source-linked supplier relationship or
performance facts: optional supplier/product/grade links, role, source area,
pickup/packing/transport responsibilities, lead-time wording, payment terms,
traceability, promised/actual/accepted/rejected quantities and timing, observed
price and claim reference. The product preserves the observation and its evidence
without deciding a supplier score, ranking, payable, inventory effect, claim
settlement or purchase recommendation.

## Contract

- command: `RecordSupplierObservation`;
- reads: `getSupplierObservation`, `listSupplierObservations`;
- permission: `evidence.record` / `evidence.read`;
- corrections are new immutable observations linked to an earlier observation in
  the same workspace;
- retrying the same command returns the original result and does not append a
  second fact or audit record;
- known supplier/product/grade references are optional and workspace-scoped.

## Evidence boundary

This slice is field-evidence infrastructure. It does not activate ASM-047/048,
supplier scoring, commercial terms, overdue conclusions, inventory, payable,
reorder or recommendations. Those require an approved workspace policy and a
separate canonical command.

## Recovery

Backup V17 exports and restores supplier observations after validating workspace,
supplier, product, grade and correction references. Restore preserves the raw
facts and does not rebuild a derived supplier result.

## Traceability

- rules: BR-EVIDENCE-013..015;
- tests: TC-EVIDENCE-060..063;
- implementation: domain contract/kernel, evidence API, Drizzle/in-memory
  repositories, backup/restore and supplier observation UI.
