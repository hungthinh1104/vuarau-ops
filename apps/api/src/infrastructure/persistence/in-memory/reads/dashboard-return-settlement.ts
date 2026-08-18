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
    saleReturnIds.every((returnId) =>
      [...store.deliveryReturnSettlements.values()].some(
        (settlement) => settlement.workspaceId === workspaceId && settlement.returnId === returnId,
      ),
    );
  const unresolvedReturnRecord = store.deliveryReturns
    .filter((returned) => saleReturnIds.includes(returned.id))
    .filter(
      (returned) =>
        ![...store.deliveryReturnSettlements.values()].some(
          (settlement) =>
            settlement.workspaceId === workspaceId && settlement.returnId === returned.id,
        ),
    )
    .toSorted((left, right) =>
      left.recordedAt === right.recordedAt
        ? right.id.localeCompare(left.id)
        : right.recordedAt.localeCompare(left.recordedAt),
    )[0];
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
