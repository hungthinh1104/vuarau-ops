import type { WorkspaceBackupV14, WorkspaceId } from "@vuarau/domain-contracts";
import { supplyCommitmentObservations } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreSupplyCommitmentObservations(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV14["payload"],
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.supplyCommitmentObservations.length === 0) return;
  await tx.insert(supplyCommitmentObservations).values(
    payload.supplyCommitmentObservations.map((raw) => ({
      ...raw,
      workspaceId,
      expectedArrivalAt: raw["expectedArrivalAt"] == null ? null : date(raw["expectedArrivalAt"]),
      transactionTime: date(raw["transactionTime"]),
      recordedAt: date(raw["recordedAt"]),
    })) as unknown as (typeof supplyCommitmentObservations.$inferInsert)[],
  );
}
