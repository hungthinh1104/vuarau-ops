import { describe, expect, it } from "vitest";
import { deriveProductCoverageQuantity } from "./index.ts";

describe("ProductCoverage arithmetic contract", () => {
  it("preserves on-hand plus inbound minus outbound", () => {
    expect(
      deriveProductCoverageQuantity({
        unit: "kg",
        onHand: 4_000,
        inboundRemaining: 6_000,
        outboundRemaining: 12_000,
      }),
    ).toEqual({
      unit: "kg",
      onHand: { valueScaled: 4_000, unit: "kg" },
      inboundRemaining: { valueScaled: 6_000, unit: "kg" },
      outboundRemaining: { valueScaled: 12_000, unit: "kg" },
      availableAfterCommitments: { valueScaled: -2_000, unit: "kg" },
      classification: "shortage",
    });
  });

  it("labels zero sources as idle and nonzero non-shortage as covered", () => {
    expect(
      deriveProductCoverageQuantity({
        unit: "bo",
        onHand: 0,
        inboundRemaining: 0,
        outboundRemaining: 0,
      }).classification,
    ).toBe("idle");
    expect(
      deriveProductCoverageQuantity({
        unit: "bo",
        onHand: 0,
        inboundRemaining: 1_000,
        outboundRemaining: 0,
      }).classification,
    ).toBe("covered");
  });
});
