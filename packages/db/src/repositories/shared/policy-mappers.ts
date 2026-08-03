import type { WorkspacePolicyDto } from "@vuarau/domain-contracts";
import { workspacePolicyDefinitionSchema } from "@vuarau/domain-contracts";
import type { workspacePolicies } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

export function toWorkspacePolicyDto(
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
    definition: workspacePolicyDefinitionSchema.parse(row.definition),
    evidenceReferences: [...row.evidenceReferences],
    createdBy: row.createdBy as WorkspacePolicyDto["createdBy"],
    createdAt: toIso(row.createdAt),
    approvedBy: row.approvedBy as WorkspacePolicyDto["approvedBy"],
    approvedAt: toIsoOrNull(row.approvedAt),
    retiredBy: row.retiredBy as WorkspacePolicyDto["retiredBy"],
    retiredAt: toIsoOrNull(row.retiredAt),
    commandId: row.commandId as WorkspacePolicyDto["commandId"],
    reason: row.reason,
  };
}
