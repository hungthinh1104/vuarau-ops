import type { WorkspaceBackupV14, WorkspaceId } from "@vuarau/domain-contracts";
import { supplierObservations } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreSupplierObservations(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV14["payload"],
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.supplierObservations.length === 0) return;
  await tx.insert(supplierObservations).values(
    payload.supplierObservations.map((raw) => ({
      ...raw,
      workspaceId,
      expectedAt: raw["expectedAt"] == null ? null : date(raw["expectedAt"]),
      actualAt: raw["actualAt"] == null ? null : date(raw["actualAt"]),
      transactionTime: date(raw["transactionTime"]),
      recordedAt: date(raw["recordedAt"]),
    })) as unknown as (typeof supplierObservations.$inferInsert)[],
  );
}
