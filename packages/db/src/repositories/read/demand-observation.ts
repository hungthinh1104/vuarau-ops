import type { DemandObservationKind } from "@vuarau/domain-contracts";
import { and, desc, eq, sql } from "drizzle-orm";
import { demandObservations } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { toDemandObservationDto } from "../shared/demand-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createDemandObservationReadRepositories = (tx: Tx) => ({
  demandObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(demandObservations)
        .where(
          and(
            eq(demandObservations.workspaceId, workspaceId),
            eq(demandObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDemandObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: DemandObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(demandObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(demandObservations.kind, kind));
      if (page.after !== null) {
        filters.push(
          sql`(${demandObservations.recordedAt}, ${demandObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(demandObservations)
        .where(and(...filters))
        .orderBy(desc(demandObservations.recordedAt), desc(demandObservations.id))
        .limit(fetchLimit(page));
      return paged(rows.map(toDemandObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});
