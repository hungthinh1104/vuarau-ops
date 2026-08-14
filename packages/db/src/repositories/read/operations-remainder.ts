import { eq } from "drizzle-orm";
import { fulfilmentRemainderCases } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export function readFulfilmentRemainderCases(tx: Tx, workspaceId: string) {
  return tx
    .select()
    .from(fulfilmentRemainderCases)
    .where(eq(fulfilmentRemainderCases.workspaceId, workspaceId));
}
