# UC-EVIDENCE-006 — Record and review demand observations

## Outcome

An authorized workspace member records source-linked customer demand before a
Sale is confirmed: optional customer/product/grade links, requested and minimum
quantities, requested time, counterparty wording and a demand reference. The
product preserves the observation and its evidence without creating a Sale,
receivable, inventory effect, forecast, shortage state or reorder recommendation.

## Contract

- command: `RecordDemandObservation`;
- reads: `getDemandObservation`, `listDemandObservations`;
- permission: `evidence.record` / `evidence.read`;
- corrections are new immutable observations linked to an earlier observation in
  the same workspace;
- retrying the same command returns the original result and does not append a
  second fact or audit record;
- known customer/product/grade references are optional and workspace-scoped.

## Evidence boundary

This slice records demand facts only. It does not activate ASM-042 inventory
planning, demand forecasting, shortage risk, reorder recommendations or any
customer-money effect. Those require canonical history, an approved workspace
policy and a separate command.

## Recovery

Backup V15 exports and restores demand observations after validating workspace,
customer, product, grade and correction references. Restore preserves the raw
facts and does not rebuild a planning or commercial result.

## Traceability

- rules: BR-EVIDENCE-016..018;
- tests: TC-EVIDENCE-064..067;
- implementation: domain contract/kernel, evidence API, Drizzle/in-memory
  repositories, backup/restore and demand observation UI.
