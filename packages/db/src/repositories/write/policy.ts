import type {
  WorkspacePolicyDto,
  WorkspacePolicyKind,
  WorkspacePolicyState,
} from "@vuarau/domain-contracts";
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
      const rows = await tx
        .insert(workspacePolicies)
        .values({
          id: policy.id,
          workspaceId: policy.workspaceId,
          policyKind: policy.policyKind,
          version: policy.version,
          state: policy.state,
          effectiveFrom: new Date(policy.effectiveFrom),
          effectiveTo: policy.effectiveTo === null ? null : new Date(policy.effectiveTo),
          definition: policy.definition,
          evidenceReferences: [...policy.evidenceReferences],
          createdBy: policy.createdBy,
          createdAt: new Date(policy.createdAt),
          approvedBy: policy.approvedBy,
          approvedAt: policy.approvedAt === null ? null : new Date(policy.approvedAt),
          retiredBy: policy.retiredBy,
          retiredAt: policy.retiredAt === null ? null : new Date(policy.retiredAt),
          commandId: policy.commandId,
          reason: policy.reason,
        })
        .onConflictDoNothing()
        .returning({ id: workspacePolicies.id });
      return rows.length === 1;
    },
    async update(policy: WorkspacePolicyDto, expectedState: WorkspacePolicyState) {
      const rows = await tx
        .update(workspacePolicies)
        .set({
          state: policy.state,
          evidenceReferences: [...policy.evidenceReferences],
          approvedBy: policy.approvedBy,
          approvedAt: policy.approvedAt === null ? null : new Date(policy.approvedAt),
          retiredBy: policy.retiredBy,
          retiredAt: policy.retiredAt === null ? null : new Date(policy.retiredAt),
          reason: policy.reason,
        })
        .where(
          and(
            eq(workspacePolicies.workspaceId, policy.workspaceId),
            eq(workspacePolicies.id, policy.id),
            eq(workspacePolicies.state, expectedState),
          ),
        )
        .returning({ id: workspacePolicies.id });
      return rows.length === 1;
    },
  },
});
