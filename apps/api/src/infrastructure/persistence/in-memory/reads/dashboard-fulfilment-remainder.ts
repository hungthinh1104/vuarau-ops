import type { FulfilmentRemainderOutcome } from "@vuarau/domain-contracts";
import type { Store } from "../store.ts";

export function saleFulfilmentRemainderStatus(
  store: Store,
  workspaceId: string,
  saleId: string,
): { readonly unresolved: boolean; readonly outcome: FulfilmentRemainderOutcome | null } {
  const latest = [...store.fulfilmentRemainderCases.values()]
    .filter((row) => row.workspaceId === workspaceId && row.saleId === saleId)
    .sort((a, b) =>
      a.transactionTime === b.transactionTime
        ? a.recordedAt === b.recordedAt
          ? b.id.localeCompare(a.id)
          : b.recordedAt.localeCompare(a.recordedAt)
        : b.transactionTime.localeCompare(a.transactionTime),
    )[0];
  return { unresolved: latest?.caseKind === "opened", outcome: latest?.outcome ?? null };
}
