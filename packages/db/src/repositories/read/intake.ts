import type { SQL } from "drizzle-orm";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import type {
  GoodsArrivalId,
  GoodsArrivalLineId,
  QualityDispositionId,
  QualityInspectionId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { goodsArrivals, qualityInspections, qualityIssueCodes } from "../../schema/index.ts";
import {
  dispositionSourceSummary,
  issueCodeDto,
  readArrival,
  readDisposition,
  readInspection,
} from "../shared/intake-mappers.ts";
import type { Page } from "../shared/read-helpers.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import type { Tx } from "../shared/types.ts";

export const createIntakeReadRepositories = (tx: Tx) => ({
  intakeReads: {
    async searchIssueCodes(args: {
      workspaceId: WorkspaceId;
      query: string;
      isActive: boolean | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(qualityIssueCodes.workspaceId, args.workspaceId)];
      if (args.isActive !== null) filters.push(eq(qualityIssueCodes.isActive, args.isActive));
      if (args.query.length > 0) {
        const pattern = `%${args.query}%`;
        filters.push(
          sql`(
            vuarau_fold(${qualityIssueCodes.code}) ILIKE vuarau_fold(${pattern}) OR
            vuarau_fold(${qualityIssueCodes.displayName}) ILIKE vuarau_fold(${pattern}) OR
            vuarau_fold(coalesce(${qualityIssueCodes.description}, '')) ILIKE vuarau_fold(${pattern})
          )`,
        );
      }
      if (args.page.after !== null) {
        filters.push(
          sql`(${qualityIssueCodes.displayName}, ${qualityIssueCodes.id}) >
              (${args.page.after.sortValue}, ${args.page.after.id}::uuid)`,
        );
      }
      const rows = await tx
        .select()
        .from(qualityIssueCodes)
        .where(and(...filters))
        .orderBy(asc(qualityIssueCodes.displayName), asc(qualityIssueCodes.id))
        .limit(fetchLimit(args.page));
      return paged(rows.map(issueCodeDto), args.page, (row) => ({
        sortValue: row.displayName,
        id: row.id,
      }));
    },
    arrival: (workspaceId: WorkspaceId, arrivalId: GoodsArrivalId) =>
      readArrival(tx, workspaceId, arrivalId),
    async listArrivals(args: {
      workspaceId: WorkspaceId;
      supplierId: string | null;
      purchaseId: string | null;
      page: Page;
    }) {
      const filters: SQL[] = [eq(goodsArrivals.workspaceId, args.workspaceId)];
      if (args.supplierId !== null) filters.push(eq(goodsArrivals.supplierId, args.supplierId));
      if (args.purchaseId !== null) filters.push(eq(goodsArrivals.purchaseId, args.purchaseId));
      if (args.page.after !== null) {
        filters.push(
          sql`(${goodsArrivals.transactionTime}, ${goodsArrivals.id}) <
              (${args.page.after.sortValue}::timestamptz, ${args.page.after.id}::uuid)`,
        );
      }
      const ids = await tx
        .select({ id: goodsArrivals.id, transactionTime: goodsArrivals.transactionTime })
        .from(goodsArrivals)
        .where(and(...filters))
        .orderBy(desc(goodsArrivals.transactionTime), desc(goodsArrivals.id))
        .limit(fetchLimit(args.page));
      const arrivals = [];
      for (const row of ids) {
        const arrival = await readArrival(tx, args.workspaceId, row.id as GoodsArrivalId);
        if (arrival !== null) arrivals.push(arrival);
      }
      return paged(arrivals, args.page, (row) => ({
        sortValue: row.transactionTime,
        id: row.id,
      }));
    },
    inspection: (workspaceId: WorkspaceId, inspectionId: QualityInspectionId) =>
      readInspection(tx, workspaceId, inspectionId),
    disposition: (workspaceId: WorkspaceId, dispositionId: QualityDispositionId) =>
      readDisposition(tx, workspaceId, dispositionId),
    async dispositionSourceSummary(
      workspaceId: WorkspaceId,
      source: Parameters<typeof dispositionSourceSummary>[2],
    ) {
      return (await dispositionSourceSummary(tx, workspaceId, source))?.summary ?? null;
    },
    async arrivalLineHistory(workspaceId: WorkspaceId, arrivalLineId: GoodsArrivalLineId) {
      const inspectionIds = await tx
        .select({ id: qualityInspections.id })
        .from(qualityInspections)
        .where(
          and(
            eq(qualityInspections.workspaceId, workspaceId),
            eq(qualityInspections.arrivalLineId, arrivalLineId),
          ),
        )
        .orderBy(asc(qualityInspections.transactionTime), asc(qualityInspections.id));
      const dispositionRows = await tx.execute(sql`
        with recursive rooted as (
          select qd.id, qd.transaction_time
          from quality_dispositions qd
          where qd.workspace_id = ${workspaceId}::uuid
            and qd.source_type = 'arrival_line'
            and qd.source_arrival_line_id = ${arrivalLineId}::uuid
          union all
          select child.id, child.transaction_time
          from quality_dispositions child
          join quality_disposition_allocations source_allocation
            on source_allocation.workspace_id = child.workspace_id
            and source_allocation.id = child.source_quarantine_allocation_id
          join rooted parent on parent.id = source_allocation.disposition_id
          where child.workspace_id = ${workspaceId}::uuid
            and child.source_type = 'quarantine_allocation'
        )
        select id::text as id from rooted order by transaction_time, id
      `);
      const inspections = [];
      for (const row of inspectionIds) {
        const inspection = await readInspection(tx, workspaceId, row.id as QualityInspectionId);
        if (inspection !== null) inspections.push(inspection);
      }
      const dispositions = [];
      for (const raw of dispositionRows) {
        const disposition = await readDisposition(
          tx,
          workspaceId,
          String(raw["id"]) as QualityDispositionId,
        );
        if (disposition !== null) dispositions.push(disposition);
      }
      return { arrivalLineId, inspections, dispositions };
    },
  },
});
