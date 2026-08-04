import type {
  WorkspacePolicyDto,
  WorkspacePolicyKind,
  WorkspacePolicyState,
} from "@vuarau/domain-contracts";
import { parseWorkspacePolicyDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { workspacePolicies } from "../../schema/index.ts";
import { toWorkspacePolicyDto } from "../shared/policy-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createWorkspacePolicyWriteRepositories = (tx: Tx) => ({
  workspacePolicies: {
    async findById(workspaceId: string, policyVersionId: string) {
      const rows = await tx
        .select()
        .from(workspacePolicies)
        .where(
          and(
            eq(workspacePolicies.workspaceId, workspaceId),
            eq(workspacePolicies.id, policyVersionId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toWorkspacePolicyDto(rows[0]);
    },
    async listForUpdate(workspaceId: string, policyKind: WorkspacePolicyKind) {
      const rows = await tx
        .select()
        .from(workspacePolicies)
        .where(
          and(
            eq(workspacePolicies.workspaceId, workspaceId),
            eq(workspacePolicies.policyKind, policyKind),
          ),
        )
        .for("update");
      return rows.map(toWorkspacePolicyDto);
    },
    async insert(policy: WorkspacePolicyDto) {
      const validated = parseWorkspacePolicyDto(policy);
      const rows = await tx
        .insert(workspacePolicies)
        .values({
          id: validated.id,
          workspaceId: validated.workspaceId,
          policyKind: validated.policyKind,
          version: validated.version,
          state: validated.state,
          effectiveFrom: new Date(validated.effectiveFrom),
          effectiveTo: validated.effectiveTo === null ? null : new Date(validated.effectiveTo),
          definition: validated.definition,
          evidenceReferences: [...validated.evidenceReferences],
          createdBy: validated.createdBy,
          createdAt: new Date(validated.createdAt),
          approvedBy: validated.approvedBy,
          approvedAt: validated.approvedAt === null ? null : new Date(validated.approvedAt),
          retiredBy: validated.retiredBy,
          retiredAt: validated.retiredAt === null ? null : new Date(validated.retiredAt),
          commandId: validated.commandId,
          reason: validated.reason,
        })
        .onConflictDoNothing()
        .returning({ id: workspacePolicies.id });
      return rows.length === 1;
    },
    async update(policy: WorkspacePolicyDto, expectedState: WorkspacePolicyState) {
      const validated = parseWorkspacePolicyDto(policy);
      const rows = await tx
        .update(workspacePolicies)
        .set({
          state: policy.state,
          evidenceReferences: [...validated.evidenceReferences],
          approvedBy: validated.approvedBy,
          approvedAt: validated.approvedAt === null ? null : new Date(validated.approvedAt),
          retiredBy: validated.retiredBy,
          retiredAt: validated.retiredAt === null ? null : new Date(validated.retiredAt),
          reason: validated.reason,
        })
        .where(
          and(
            eq(workspacePolicies.workspaceId, validated.workspaceId),
            eq(workspacePolicies.id, validated.id),
            eq(workspacePolicies.state, expectedState),
          ),
        )
        .returning({ id: workspacePolicies.id });
      return rows.length === 1;
    },
  },
});
