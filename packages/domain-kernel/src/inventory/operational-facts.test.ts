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

  it("keeps active delivery work separate from net delivered truth", () => {
    expect(
      deriveSaleLineFulfilmentFacts({
        orderedQuantityScaled: 100,
        dispatchedQuantityScaled: 80,
        returnedQuantityScaled: 20,
        activeDispatchedRemainingQuantityScaled: 60,
      }),
    ).toEqual({
      dispatchedQuantityScaled: 80,
      returnedQuantityScaled: 20,
      netFulfilledQuantityScaled: 60,
      activeDispatchedRemainingQuantityScaled: 60,
      remainingQuantityScaled: 40,
      integrity: false,
    });
  });

  it("flags a return chain that exceeds dispatch without producing negative remaining", () => {
    expect(
      deriveSaleLineFulfilmentFacts({
        orderedQuantityScaled: 100,
        dispatchedQuantityScaled: 60,
        returnedQuantityScaled: 80,
        activeDispatchedRemainingQuantityScaled: 0,
      }),
    ).toMatchObject({
      netFulfilledQuantityScaled: -20,
      remainingQuantityScaled: 120,
      integrity: true,
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

  it("models a reversed receipt plus replacement as current net receiving", () => {
    expect(
      derivePurchaseLineReceivingFacts({
        orderedQuantityScaled: 100,
        directReceivedNetQuantityScaled: 60,
        inspectedAcceptedNetQuantityScaled: 0,
      }),
    ).toEqual({
      directReceivedNetQuantityScaled: 60,
      inspectedAcceptedNetQuantityScaled: 0,
      receivedNetQuantityScaled: 60,
      remainingQuantityScaled: 40,
      integrity: false,
    });
  });
});
