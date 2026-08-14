import type { Store } from "../store.ts";
import { key } from "../store.ts";

export function saleReturnSettlementStatus(
  store: Store,
  workspaceId: string,
  saleId: string,
  returnedFulfilment: boolean,
): {
  readonly saleReturnIds: readonly string[];
  readonly returnSettlementResolved: boolean;
  readonly returnSettlementUnresolved: boolean;
} {
  const saleReturnIds = store.deliveryReturns
    .filter((returned) => returned.workspaceId === workspaceId)
    .filter(
      (returned) => store.deliveries.get(key(workspaceId, returned.deliveryId))?.saleId === saleId,
    )
    .map((returned) => returned.id);
  const returnSettlementResolved =
    returnedFulfilment &&
    saleReturnIds.length > 0 &&
    saleReturnIds.every((returnId) =>
      [...store.deliveryReturnSettlements.values()].some(
        (settlement) => settlement.workspaceId === workspaceId && settlement.returnId === returnId,
      ),
    );
  return {
    saleReturnIds,
    returnSettlementResolved,
    returnSettlementUnresolved: returnedFulfilment && !returnSettlementResolved,
  };
}
