import type { WorkspaceBackupV14, WorkspaceId } from "@vuarau/domain-contracts";
import { workspacePolicies } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreWorkspacePolicies(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV14["payload"],
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.workspacePolicies.length === 0) return;
  await tx.insert(workspacePolicies).values(
    payload.workspacePolicies.map((raw) => ({
      ...raw,
      workspaceId,
      effectiveFrom: date(raw["effectiveFrom"]),
      effectiveTo: raw["effectiveTo"] == null ? null : date(raw["effectiveTo"]),
      createdAt: date(raw["createdAt"]),
      approvedAt: raw["approvedAt"] == null ? null : date(raw["approvedAt"]),
      retiredAt: raw["retiredAt"] == null ? null : date(raw["retiredAt"]),
    })) as unknown as (typeof workspacePolicies.$inferInsert)[],
  );
}
