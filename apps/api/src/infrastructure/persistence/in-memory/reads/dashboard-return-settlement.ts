import type { Store } from "../store.ts";
import { key } from "../store.ts";
import { currentDeliveryReturnSettlement } from "@vuarau/domain-kernel";

export function saleReturnSettlementStatus(
  store: Store,
  workspaceId: string,
  saleId: string,
  returnedFulfilment: boolean,
): {
  readonly saleReturnIds: readonly string[];
  readonly returnSettlementResolved: boolean;
  readonly returnSettlementUnresolved: boolean;
  readonly unresolvedReturnId: string | null;
  readonly unresolvedDeliveryId: string | null;
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
    saleReturnIds.every(
      (returnId) =>
        currentDeliveryReturnSettlement(
          [...store.deliveryReturnSettlements.values()].filter(
            (settlement) => settlement.workspaceId === workspaceId,
          ),
          returnId,
        ) !== null,
    );
  const unresolvedReturnRecord = store.deliveryReturns
    .filter((returned) => saleReturnIds.includes(returned.id))
    .filter(
      (returned) =>
        currentDeliveryReturnSettlement(
          [...store.deliveryReturnSettlements.values()].filter(
            (settlement) => settlement.workspaceId === workspaceId,
          ),
          returned.id,
        ) === null,
    )
    .toSorted((left, right) => left.id.localeCompare(right.id))[0];
  const unresolvedReturn = unresolvedReturnRecord?.id;
  const unresolvedDeliveryId = unresolvedReturnRecord?.deliveryId ?? null;
  return {
    saleReturnIds,
    returnSettlementResolved,
    returnSettlementUnresolved: returnedFulfilment && !returnSettlementResolved,
    unresolvedReturnId: unresolvedReturn ?? null,
    unresolvedDeliveryId,
  };
}
