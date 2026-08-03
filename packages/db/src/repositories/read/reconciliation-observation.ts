import { and, desc, eq, sql } from "drizzle-orm";
import type { ReconciliationObservationKind } from "@vuarau/domain-contracts";
import { reconciliationObservations } from "../../schema/index.ts";
import { paged, fetchLimit } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toReconciliationObservationDto } from "../shared/reconciliation-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createReconciliationObservationReadRepositories = (tx: Tx) => ({
  reconciliationObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(reconciliationObservations)
        .where(
          and(
            eq(reconciliationObservations.workspaceId, workspaceId),
            eq(reconciliationObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toReconciliationObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: ReconciliationObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(reconciliationObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(reconciliationObservations.kind, kind));
      if (page.after !== null) {
        filters.push(
          sql`(${reconciliationObservations.recordedAt}, ${reconciliationObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(reconciliationObservations)
        .where(and(...filters))
        .orderBy(desc(reconciliationObservations.recordedAt), desc(reconciliationObservations.id))
        .limit(fetchLimit(page));
      return paged(rows.map(toReconciliationObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});
