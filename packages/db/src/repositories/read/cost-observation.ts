import { and, desc, eq, sql } from "drizzle-orm";
import type { CostObservationKind } from "@vuarau/domain-contracts";
import { costObservations } from "../../schema/index.ts";
import { paged, fetchLimit } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toCostObservationDto } from "../shared/cost-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createCostObservationReadRepositories = (tx: Tx) => ({
  costObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(costObservations)
        .where(
          and(
            eq(costObservations.workspaceId, workspaceId),
            eq(costObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toCostObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: CostObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(costObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(costObservations.kind, kind));
      if (page.after !== null) {
        filters.push(
          sql`(${costObservations.recordedAt}, ${costObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(costObservations)
        .where(and(...filters))
        .orderBy(desc(costObservations.recordedAt), desc(costObservations.id))
        .limit(fetchLimit(page));
      return paged(rows.map(toCostObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});
