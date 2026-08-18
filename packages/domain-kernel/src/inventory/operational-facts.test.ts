import { describe, expect, it } from "vitest";
import {
  derivePurchaseLineReceivingFacts,
  deriveSaleLineFulfilmentFacts,
} from "./operational-facts.ts";

describe("shared operational facts", () => {
  it("keeps a returned fulfilment net instead of adding the return twice", () => {
    expect(
      deriveSaleLineFulfilmentFacts({
        orderedQuantityScaled: 100,
        dispatchedQuantityScaled: 60,
        returnedQuantityScaled: 60,
        activeDispatchedRemainingQuantityScaled: 0,
      }),
    ).toEqual({
      dispatchedQuantityScaled: 60,
      returnedQuantityScaled: 60,
      netFulfilledQuantityScaled: 0,
      activeDispatchedRemainingQuantityScaled: 0,
      remainingQuantityScaled: 100,
      integrity: false,
    });
  });

  it("marks over-received facts without hiding the exact remaining formula", () => {
    expect(
      derivePurchaseLineReceivingFacts({
        orderedQuantityScaled: 100,
        directReceivedNetQuantityScaled: 60,
        inspectedAcceptedNetQuantityScaled: 60,
      }),
    ).toMatchObject({
      receivedNetQuantityScaled: 120,
      remainingQuantityScaled: 0,
      integrity: true,
    });
  });
});
