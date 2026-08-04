import type { WorkspacePolicyDto } from "@vuarau/domain-contracts";
import { parseWorkspacePolicyDto } from "@vuarau/domain-contracts";
import type { workspacePolicies } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

export function toWorkspacePolicyDto(
  row: typeof workspacePolicies.$inferSelect,
): WorkspacePolicyDto {
  return parseWorkspacePolicyDto({
    id: row.id as WorkspacePolicyDto["id"],
    workspaceId: row.workspaceId as WorkspacePolicyDto["workspaceId"],
    policyKind: row.policyKind,
    version: row.version,
    state: row.state,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIsoOrNull(row.effectiveTo),
    definition: row.definition,
    evidenceReferences: [...row.evidenceReferences],
    createdBy: row.createdBy as WorkspacePolicyDto["createdBy"],
    createdAt: toIso(row.createdAt),
    approvedBy: row.approvedBy as WorkspacePolicyDto["approvedBy"],
    approvedAt: toIsoOrNull(row.approvedAt),
    retiredBy: row.retiredBy as WorkspacePolicyDto["retiredBy"],
    retiredAt: toIsoOrNull(row.retiredAt),
    commandId: row.commandId as WorkspacePolicyDto["commandId"],
    reason: row.reason,
  });
}

export function tryToWorkspacePolicyDto(
  row: typeof workspacePolicies.$inferSelect,
): WorkspacePolicyDto | null {
  try {
    return toWorkspacePolicyDto(row);
  } catch {
    return null;
  }
}

/** Keeps corrupt persisted rows visible to domain resolvers without throwing from reads. */
export function toCorruptWorkspacePolicyDto(
  row: typeof workspacePolicies.$inferSelect,
): WorkspacePolicyDto {
  return {
    id: row.id as WorkspacePolicyDto["id"],
    workspaceId: row.workspaceId as WorkspacePolicyDto["workspaceId"],
    policyKind: row.policyKind,
    version: row.version,
    state: row.state,
    effectiveFrom: toIso(row.effectiveFrom),
    effectiveTo: toIsoOrNull(row.effectiveTo),
    definition: row.definition,
    evidenceReferences: [...row.evidenceReferences],
    createdBy: row.createdBy as WorkspacePolicyDto["createdBy"],
    createdAt: toIso(row.createdAt),
    approvedBy: row.approvedBy as WorkspacePolicyDto["approvedBy"],
    approvedAt: toIsoOrNull(row.approvedAt),
    retiredBy: row.retiredBy as WorkspacePolicyDto["retiredBy"],
    retiredAt: toIsoOrNull(row.retiredAt),
    commandId: row.commandId as WorkspacePolicyDto["commandId"],
    reason: row.reason,
  } as unknown as WorkspacePolicyDto;
}
