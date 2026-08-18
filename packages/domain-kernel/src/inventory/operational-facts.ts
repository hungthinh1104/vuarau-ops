import { exactIntegerDifference, exactIntegerSum } from "../shared/money.ts";

export type SaleLineFulfilmentFacts = {
  readonly dispatchedQuantityScaled: number;
  readonly returnedQuantityScaled: number;
  readonly netFulfilledQuantityScaled: number;
  readonly activeDispatchedRemainingQuantityScaled: number;
  readonly remainingQuantityScaled: number;
  readonly integrity: boolean;
};

/** The arithmetic owner for sale-line physical truth. */
export function deriveSaleLineFulfilmentFacts(input: {
  readonly orderedQuantityScaled: number;
  readonly dispatchedQuantityScaled: number;
  readonly returnedQuantityScaled: number;
  readonly activeDispatchedRemainingQuantityScaled: number;
  readonly invalidUnit?: boolean;
}): SaleLineFulfilmentFacts {
  const netFulfilledQuantityScaled = exactIntegerDifference(
    input.dispatchedQuantityScaled,
    input.returnedQuantityScaled,
    "fulfilment.net.quantity_scaled",
  );
  return {
    dispatchedQuantityScaled: input.dispatchedQuantityScaled,
    returnedQuantityScaled: input.returnedQuantityScaled,
    netFulfilledQuantityScaled,
    activeDispatchedRemainingQuantityScaled: input.activeDispatchedRemainingQuantityScaled,
    remainingQuantityScaled: Math.max(
      0,
      exactIntegerDifference(
        input.orderedQuantityScaled,
        netFulfilledQuantityScaled,
        "fulfilment.remaining.quantity_scaled",
      ),
    ),
    integrity:
      input.invalidUnit === true ||
      input.orderedQuantityScaled < 0 ||
      input.dispatchedQuantityScaled < 0 ||
      input.returnedQuantityScaled < 0 ||
      input.activeDispatchedRemainingQuantityScaled < 0 ||
      input.activeDispatchedRemainingQuantityScaled > input.dispatchedQuantityScaled ||
      netFulfilledQuantityScaled > input.orderedQuantityScaled ||
      input.returnedQuantityScaled > input.dispatchedQuantityScaled,
  };
}

export type PurchaseLineReceivingFacts = {
  readonly directReceivedNetQuantityScaled: number;
  readonly inspectedAcceptedNetQuantityScaled: number;
  readonly receivedNetQuantityScaled: number;
  readonly remainingQuantityScaled: number;
  readonly integrity: boolean;
};

/** The arithmetic owner for purchase-line receipt/inspection truth. */
export function derivePurchaseLineReceivingFacts(input: {
  readonly orderedQuantityScaled: number;
  readonly directReceivedNetQuantityScaled: number;
  readonly inspectedAcceptedNetQuantityScaled: number;
  readonly invalidUnit?: boolean;
}): PurchaseLineReceivingFacts {
  const receivedNetQuantityScaled = exactIntegerSum(
    [input.directReceivedNetQuantityScaled, input.inspectedAcceptedNetQuantityScaled],
    "receiving.net.quantity_scaled",
  );
  return {
    directReceivedNetQuantityScaled: input.directReceivedNetQuantityScaled,
    inspectedAcceptedNetQuantityScaled: input.inspectedAcceptedNetQuantityScaled,
    receivedNetQuantityScaled,
    remainingQuantityScaled: Math.max(
      0,
      exactIntegerDifference(
        input.orderedQuantityScaled,
        receivedNetQuantityScaled,
        "receiving.remaining.quantity_scaled",
      ),
    ),
    integrity:
      input.invalidUnit === true ||
      input.orderedQuantityScaled < 0 ||
      input.directReceivedNetQuantityScaled < 0 ||
      input.inspectedAcceptedNetQuantityScaled < 0 ||
      receivedNetQuantityScaled > input.orderedQuantityScaled,
  };
}
