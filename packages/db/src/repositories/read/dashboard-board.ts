import type { CursorPosition, OperationsBoardInput } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { queryRows } from "./dashboard-rows.ts";

/**
 * Compatibility adapter for callers that need an unbounded Board read (close
 * exception identities). The semantic SQL lives in dashboard-rows; this file
 * no longer owns a second fast-path copy of the Board facts.
 */
export async function queryFastOperationsBoardPage(
  tx: Tx,
  input: OperationsBoardInput & {
    readonly page: { readonly after: CursorPosition | null; readonly limit: number };
    readonly now: string;
  },
) {
  const result = await queryRows(tx, input, {
    includeActivity: true,
    includeCounts: false,
  });
  return { rows: result.rows };
}
