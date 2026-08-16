import type { IsoInstant, WorkspaceId } from "@vuarau/domain-contracts";
import type { Tx } from "../shared/types.ts";
import { queryFastOperationsBoardPage } from "./dashboard-board.ts";

/**
 * Resolves every current acknowledgeable Board exception for a close command.
 * This deliberately uses the canonical Board derivation without its screen
 * pagination; a partial page must never authorize a close or acknowledgement.
 */
export async function readCurrentOperationsExceptionIdentities(
  tx: Tx,
  args: { workspaceId: WorkspaceId; asOf: IsoInstant },
) {
  const board = await queryFastOperationsBoardPage(tx, {
    workspaceId: args.workspaceId,
    filter: "all",
    sort: "updated_desc",
    search: "",
    cursor: null,
    limit: Number.MAX_SAFE_INTEGER,
    page: { after: null, limit: Number.MAX_SAFE_INTEGER },
    now: args.asOf,
  });
  return board.rows.flatMap((row) =>
    row.exceptions.flatMap((exception) =>
      exception.closeImpact !== "acknowledgeable" || exception.source.id === null
        ? []
        : [{ kind: exception.kind, source: { ...exception.source, id: exception.source.id } }],
    ),
  );
}
