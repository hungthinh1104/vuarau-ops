import { and, desc, eq, sql } from "drizzle-orm";
import type { DebtObservationKind } from "@vuarau/domain-contracts";
import { debtObservations } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toDebtObservationDto } from "../shared/debt-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createDebtObservationReadRepositories = (tx: Tx) => ({
  debtObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(debtObservations)
        .where(
          and(eq(debtObservations.workspaceId, workspaceId), eq(debtObservations.id, observationId)),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDebtObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: DebtObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(debtObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(debtObservations.kind, kind));
      if (page.after !== null) {
        filters.push(
          sql`(${debtObservations.recordedAt}, ${debtObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(debtObservations)
        .where(and(...filters))
        .orderBy(desc(debtObservations.recordedAt), desc(debtObservations.id))
        .limit(fetchLimit(page));
      return paged(rows.map(toDebtObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
  },
});
