import type {
  SupplierId,
  SupplyCommitmentId,
  SupplyCommitmentStatus,
} from "@vuarau/domain-contracts";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { supplyCommitmentLines, supplyCommitments } from "../../schema/index.ts";
import { fetchLimit, paged } from "../shared/read-helpers.ts";
import {
  loadSupplyCommitment,
  mapSupplyCommitmentRows,
} from "../shared/supply-commitment-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplyCommitmentReadRepositories = (tx: Tx) => ({
  supplyCommitmentReads: {
    get: (workspaceId: string, id: SupplyCommitmentId) => loadSupplyCommitment(tx, workspaceId, id),
    async list(args: {
      workspaceId: string;
      supplierId: SupplierId | null;
      status: SupplyCommitmentStatus | null;
      page: { after: { sortValue: string; id: string } | null; limit: number };
    }) {
      const filters = [eq(supplyCommitments.workspaceId, args.workspaceId)];
      if (args.supplierId !== null) filters.push(eq(supplyCommitments.supplierId, args.supplierId));
      if (args.status !== null) filters.push(eq(supplyCommitments.status, args.status));
      if (args.page.after !== null) {
        const [transactionTime, recordedAt] = args.page.after.sortValue.split("|");
        filters.push(sql`(${supplyCommitments.transactionTime}, ${supplyCommitments.recordedAt}, ${supplyCommitments.id})
          < (${transactionTime}::timestamptz, ${recordedAt}::timestamptz, ${args.page.after.id}::uuid)`);
      }
      const rows = await tx
        .select()
        .from(supplyCommitments)
        .where(and(...filters))
        .orderBy(
          desc(supplyCommitments.transactionTime),
          desc(supplyCommitments.recordedAt),
          desc(supplyCommitments.id),
        )
        .limit(fetchLimit(args.page));
      const ids = rows.map((row) => row.id);
      const lines =
        ids.length === 0
          ? []
          : await tx
              .select()
              .from(supplyCommitmentLines)
              .where(
                and(
                  eq(supplyCommitmentLines.workspaceId, args.workspaceId),
                  inArray(supplyCommitmentLines.supplyCommitmentId, ids),
                ),
              );
      return paged(mapSupplyCommitmentRows(rows, lines), args.page, (row) => ({
        sortValue: `${row.transactionTime}|${row.recordedAt}`,
        id: row.id,
      }));
    },
  },
});
