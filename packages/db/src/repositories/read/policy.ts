import type { WorkspacePolicyKind, WorkspacePolicyState } from "@vuarau/domain-contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import { workspacePolicies } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toCorruptWorkspacePolicyDto, tryToWorkspacePolicyDto } from "../shared/policy-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createWorkspacePolicyReadRepositories = (tx: Tx) => ({
  workspacePolicyReads: {
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
      return rows[0] === undefined ? null : tryToWorkspacePolicyDto(rows[0]);
    },
    async list({
      workspaceId,
      policyKind,
      state,
      page,
    }: {
      workspaceId: string;
      policyKind: WorkspacePolicyKind | null;
      state: WorkspacePolicyState | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(workspacePolicies.workspaceId, workspaceId)];
      if (policyKind !== null) filters.push(eq(workspacePolicies.policyKind, policyKind));
      if (state !== null) filters.push(eq(workspacePolicies.state, state));
      if (page.after !== null) {
        filters.push(
          sql`(${workspacePolicies.createdAt}, ${workspacePolicies.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(workspacePolicies)
        .where(and(...filters))
        .orderBy(desc(workspacePolicies.createdAt), desc(workspacePolicies.id))
        .limit(fetchLimit(page));
      return paged(
        rows.flatMap((row) => {
          const policy = tryToWorkspacePolicyDto(row);
          return policy === null ? [] : [policy];
        }),
        page,
        (row) => ({
          sortValue: row.createdAt,
          id: row.id,
        }),
      );
    },
    async listAll(workspaceId: string) {
      const rows = await tx
        .select()
        .from(workspacePolicies)
        .where(eq(workspacePolicies.workspaceId, workspaceId))
        .orderBy(desc(workspacePolicies.version), desc(workspacePolicies.id));
      return rows.map((row) => tryToWorkspacePolicyDto(row) ?? toCorruptWorkspacePolicyDto(row));
    },
  },
});
