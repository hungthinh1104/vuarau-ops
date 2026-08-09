import {
  parseWorkspacePolicyDto,
  type WorkspaceBackupV14,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import { hasOverlappingWorkspacePolicyEffectiveWindow } from "@vuarau/domain-kernel";
import { workspacePolicies } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreWorkspacePolicies(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV14["payload"],
  date: (value: unknown) => Date,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly reason: string }> {
  if (payload.workspacePolicies.length === 0) return { ok: true };
  let policies;
  try {
    policies = payload.workspacePolicies.map((raw) =>
      parseWorkspacePolicyDto({ ...raw, workspaceId }),
    );
  } catch {
    return { ok: false, reason: "malformed policy definition" };
  }
  for (const [index, policy] of policies.entries()) {
    if (hasOverlappingWorkspacePolicyEffectiveWindow(policy, policies.slice(0, index))) {
      return { ok: false, reason: "overlapping policy effective windows" };
    }
  }
  await tx.insert(workspacePolicies).values(
    policies.map((raw) => ({
      ...raw,
      workspaceId,
      effectiveFrom: date(raw["effectiveFrom"]),
      effectiveTo: raw["effectiveTo"] == null ? null : date(raw["effectiveTo"]),
      createdAt: date(raw["createdAt"]),
      approvedAt: raw["approvedAt"] == null ? null : date(raw["approvedAt"]),
      retiredAt: raw["retiredAt"] == null ? null : date(raw["retiredAt"]),
    })) as unknown as (typeof workspacePolicies.$inferInsert)[],
  );
  return { ok: true };
}
