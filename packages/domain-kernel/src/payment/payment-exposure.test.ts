import { describe, expect, it } from "vitest";
import { derivePaymentExposure } from "./payment-exposure.ts";

const allocation = (amountMinor: number, reversedAmountMinor = 0) => ({
  amountMinor,
  reversedAmountMinor,
});

describe("PaymentExposure", () => {
  it.each([
    ["normal", 1_000, 0, [], 0, 1_000],
    ["partial allocation", 1_000, 0, [allocation(400)], 0, 600],
    ["full allocation", 1_000, 0, [allocation(1_000)], 0, 0],
    ["payment reversal", 1_000, 300, [], 0, 700],
    ["allocation reversal", 1_000, 0, [allocation(400, 150)], 0, 750],
    ["preserved credit", 1_000, 0, [], 1_000, 0],
    ["overlapping allocation and credit", 1_000, 0, [allocation(700)], 400, 0],
  ])(
    "derives %s exposure without depending on source order",
    (
      _label,
      originalAmountMinor,
      reversedAmountMinor,
      allocations,
      preservedCreditAmountMinor,
      expectedAvailable,
    ) => {
      const result = derivePaymentExposure({
        originalAmountMinor,
        reversedAmountMinor,
        allocations,
        preservedCreditAmountMinor,
      });
      expect(result?.availableAmountMinor).toBe(expectedAvailable);
    },
  );

  it("keeps multiple allocations deterministic when their rows arrive out of order", () => {
    const input = {
      originalAmountMinor: 1_000,
      reversedAmountMinor: 100,
      preservedCreditAmountMinor: 50,
    };
    const first = derivePaymentExposure({
      ...input,
      allocations: [allocation(250, 25), allocation(300, 100)],
    });
    const second = derivePaymentExposure({
      ...input,
      allocations: [allocation(300, 100), allocation(250, 25)],
    });
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      effectiveAmountMinor: 900,
      allocatedAmountMinor: 425,
      preservedCreditAmountMinor: 50,
      availableAmountMinor: 425,
    });
  });

  it("fails closed at the exact integer boundary", () => {
    expect(
      derivePaymentExposure({
        originalAmountMinor: Number.MAX_SAFE_INTEGER,
        reversedAmountMinor: 0,
        allocations: [allocation(Number.MAX_SAFE_INTEGER), allocation(1)],
        preservedCreditAmountMinor: 0,
      }),
    ).toBeNull();
  });

  it("does not create negative exposure from an invalid reversal or correction chain", () => {
    expect(
      derivePaymentExposure({
        originalAmountMinor: 100,
        reversedAmountMinor: 200,
        allocations: [allocation(100, 200)],
        preservedCreditAmountMinor: 300,
      }),
    ).toMatchObject({
      effectiveAmountMinor: 0,
      allocatedAmountMinor: 0,
      availableAmountMinor: 0,
    });
  });
});
