import type { WorkspaceBackupV14, WorkspaceBackupV17, WorkspaceId } from "@vuarau/domain-contracts";
import {
  supplyCommitmentLines,
  supplyCommitmentObservations,
  supplyCommitments,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreSupplyCommitments(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV17["payload"],
  date: (value: unknown) => Date,
) {
  if (payload.supplyCommitments.length > 0) {
    await tx.insert(supplyCommitments).values(
      payload.supplyCommitments.map((raw) => {
        const row = { ...raw, workspaceId } as Record<string, unknown>;
        return {
          ...row,
          expectedArrivalAt:
            row["expectedArrivalAt"] == null ? null : date(row["expectedArrivalAt"]),
          paymentTermsDueAt:
            row["paymentTermsDueAt"] == null ? null : date(row["paymentTermsDueAt"]),
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
          confirmedAt: row["confirmedAt"] == null ? null : date(row["confirmedAt"]),
          cancelledAt: row["cancelledAt"] == null ? null : date(row["cancelledAt"]),
        };
      }) as unknown as (typeof supplyCommitments.$inferInsert)[],
    );
  }
  if (payload.supplyCommitmentLines.length > 0) {
    await tx.insert(supplyCommitmentLines).values(
      payload.supplyCommitmentLines.map((raw) => ({
        ...raw,
        workspaceId,
      })) as unknown as (typeof supplyCommitmentLines.$inferInsert)[],
    );
  }
}

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
