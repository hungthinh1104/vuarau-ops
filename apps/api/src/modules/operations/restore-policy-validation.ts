import type { WorkspacePolicyDto } from "@vuarau/domain-contracts";
import { workspacePolicyDtoSchema } from "@vuarau/domain-contracts";
import { hasOverlappingWorkspacePolicyEffectiveWindow } from "@vuarau/domain-kernel";

export function validWorkspacePolicyCollection(
  rows: readonly Record<string, unknown>[],
  sourceWorkspaceId: string,
): boolean {
  const policies: WorkspacePolicyDto[] = [];
  for (const row of rows) {
    const parsed = workspacePolicyDtoSchema.safeParse({ ...row, workspaceId: sourceWorkspaceId });
    if (!parsed.success) return false;
    policies.push(parsed.data);
  }
  return !policies.some((candidate, index) =>
    hasOverlappingWorkspacePolicyEffectiveWindow(candidate, policies.slice(index + 1)),
  );
}
