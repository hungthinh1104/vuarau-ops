import { and, desc, eq, sql } from "drizzle-orm";
import type { SupplierObservationKind } from "@vuarau/domain-contracts";
import { supplierObservations } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import { fromIso } from "../row-mappers.ts";
import { toSupplierObservationDto } from "../shared/supplier-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplierObservationReadRepositories = (tx: Tx) => ({
  supplierObservationReads: {
    async get(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(
          and(
            eq(supplierObservations.workspaceId, workspaceId),
            eq(supplierObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplierObservationDto(rows[0]);
    },
    async list({
      workspaceId,
      kind,
      page,
    }: {
      workspaceId: string;
      kind: SupplierObservationKind | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(supplierObservations.workspaceId, workspaceId)];
      if (kind !== null) filters.push(eq(supplierObservations.kind, kind));
      if (page.after !== null)
        filters.push(
          sql`(${supplierObservations.recordedAt}, ${supplierObservations.id}) < (${fromIso(page.after.sortValue)}, ${page.after.id}::uuid)`,
        );
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(and(...filters))
        .orderBy(desc(supplierObservations.recordedAt), desc(supplierObservations.id))
        .limit(fetchLimit(page));
      return paged(rows.map(toSupplierObservationDto), page, (row) => ({
        sortValue: row.recordedAt,
        id: row.id,
      }));
    },
    async listAll(workspaceId: string) {
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(eq(supplierObservations.workspaceId, workspaceId))
        .orderBy(
          supplierObservations.transactionTime,
          supplierObservations.recordedAt,
          supplierObservations.id,
        );
      return rows.map(toSupplierObservationDto);
    },
  },
});
