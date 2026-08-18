import type { OperationsBoardCountsInput } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { queryRows } from "./dashboard-rows.ts";

/**
 * Counts are the same Board facts as a page. Keep this adapter for the public
 * repository shape, but deliberately route it through the canonical row query
 * instead of maintaining a second SQL copy of delivery, return, receiving and
 * payment semantics.
 */
export async function queryOperationsBoardCounts(
  tx: Tx,
  input: OperationsBoardCountsInput & { readonly now: string },
) {
  const result = await queryRows(
    tx,
    {
      ...input,
      // The count strip describes the complete search scope, not the selected
      // chip. Preserve that contract at the repository boundary.
      filter: "all",
      sort: "updated_desc",
      cursor: null,
      limit: 1,
      page: { after: null, limit: 1 },
    },
    { includeActivity: false, includeCounts: true },
  );
  return { counts: result.counts, statusCounts: result.statusCounts };
}
