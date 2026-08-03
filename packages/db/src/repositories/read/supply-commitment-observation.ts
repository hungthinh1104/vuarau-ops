import { and, desc, eq, sql } from "drizzle-orm";
import type { SupplyCommitmentObservationKind } from "@vuarau/domain-contracts";
import { supplyCommitmentObservations } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toSupplyCommitmentObservationDto } from "../shared/supply-commitment-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplyCommitmentObservationReadRepositories = (tx: Tx) => ({
  supplyCommitmentObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplyCommitmentObservations)
        .where(
          and(
            eq(supplyCommitmentObservations.workspaceId, workspaceId),
            eq(supplyCommitmentObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplyCommitmentObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: SupplyCommitmentObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(supplyCommitmentObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(supplyCommitmentObservations.kind, kind));
      if (page.after !== null) {
        filters.push(
          sql`(${supplyCommitmentObservations.recordedAt}, ${supplyCommitmentObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(supplyCommitmentObservations)
        .where(and(...filters))
        .orderBy(
          desc(supplyCommitmentObservations.recordedAt),
          desc(supplyCommitmentObservations.id),
        )
        .limit(fetchLimit(page));
      return paged(rows.map(toSupplyCommitmentObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});
