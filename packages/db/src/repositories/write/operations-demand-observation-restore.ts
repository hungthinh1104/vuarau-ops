import type { WorkspaceBackupV15, WorkspaceId } from "@vuarau/domain-contracts";
import { demandObservations } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreDemandObservations(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV15["payload"],
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.demandObservations.length === 0) return;
  await tx.insert(demandObservations).values(
    payload.demandObservations.map((raw) => ({
      ...raw,
      workspaceId,
      requestedForAt: raw["requestedForAt"] == null ? null : date(raw["requestedForAt"]),
      transactionTime: date(raw["transactionTime"]),
      recordedAt: date(raw["recordedAt"]),
    })) as unknown as (typeof demandObservations.$inferInsert)[],
  );
}
