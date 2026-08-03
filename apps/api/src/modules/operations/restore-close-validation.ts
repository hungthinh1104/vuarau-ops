import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";

export function validCloseReferences(input: {
  payload: WorkspaceBackupV19["payload"];
  workspacePolicyIds: ReadonlySet<unknown>;
  reconciliationObservationIds: ReadonlySet<unknown>;
  cashAccounts: ReadonlySet<unknown>;
  cashMovements: ReadonlySet<unknown>;
}): boolean {
  const { payload, workspacePolicyIds, reconciliationObservationIds, cashAccounts, cashMovements } =
    input;
  const operationalCloseIds = new Set(payload.operationalCloses.map((row) => row["id"]));
  const cashStatementMatchIds = new Set(payload.cashStatementMatches.map((row) => row["id"]));
  return (
    payload.operationalCloses.every(
      (row) =>
        workspacePolicyIds.has(row["policyVersionId"]) &&
        Array.isArray(row["observationIds"]) &&
        row["observationIds"].every((id) => reconciliationObservationIds.has(id)),
    ) &&
    payload.operationalCloseReopens.every((row) =>
      operationalCloseIds.has(row["operationalCloseId"]),
    ) &&
    payload.cashStatementMatches.every(
      (row) =>
        cashAccounts.has(row["cashAccountId"]) &&
        cashMovements.has(row["cashMovementId"]) &&
        workspacePolicyIds.has(row["policyVersionId"]),
    ) &&
    payload.cashStatementMatchReversals.every((row) =>
      cashStatementMatchIds.has(row["cashStatementMatchId"]),
    )
  );
}
