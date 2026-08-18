import type { FulfilmentRemainderOutcome } from "@vuarau/domain-contracts";
import {
  currentFulfilmentRemainderCase,
  fulfilmentRemainderNeedsConsequence,
} from "@vuarau/domain-kernel";
import type { Store } from "../store.ts";

export function saleFulfilmentRemainderStatus(
  store: Store,
  workspaceId: string,
  saleId: string,
): { readonly unresolved: boolean; readonly outcome: FulfilmentRemainderOutcome | null } {
  const latest = currentFulfilmentRemainderCase(
    [...store.fulfilmentRemainderCases.values()].filter(
      (row) => row.workspaceId === workspaceId && row.saleId === saleId,
    ),
  );
  return {
    unresolved: fulfilmentRemainderNeedsConsequence(latest),
    outcome: latest?.outcome ?? null,
  };
}
