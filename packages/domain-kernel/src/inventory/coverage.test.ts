import { describe, expect, it } from "vitest";
import type { QualityGradeId } from "@vuarau/domain-contracts";
import { deriveProductCoverageQuantity } from "./index.ts";

const QUALITY_GRADE_ID = "00000000-0000-4000-8000-000000000001" as QualityGradeId;

describe("ProductCoverage arithmetic contract", () => {
  it("preserves on-hand plus inbound minus outbound", () => {
    expect(
      deriveProductCoverageQuantity({
        unit: "kg",
        qualityGradeId: QUALITY_GRADE_ID,
        qualityGradeName: "Loại 1",
        onHand: 4_000,
        inboundRemaining: 6_000,
        outboundRemaining: 12_000,
      }),
    ).toEqual({
      unit: "kg",
      qualityGradeId: QUALITY_GRADE_ID,
      qualityGradeName: "Loại 1",
      onHand: { valueScaled: 4_000, unit: "kg" },
      inboundRemaining: { valueScaled: 6_000, unit: "kg" },
      outboundRemaining: { valueScaled: 12_000, unit: "kg" },
      availableAfterCommitments: { valueScaled: -2_000, unit: "kg" },
      classification: "shortage",
    });
  });

  it("keeps an ungraded row separate from a named grade", () => {
    const ungraded = deriveProductCoverageQuantity({
      unit: "kg",
      onHand: 0,
      inboundRemaining: 6_000,
      outboundRemaining: 0,
    });
    const graded = deriveProductCoverageQuantity({
      unit: "kg",
      qualityGradeId: QUALITY_GRADE_ID,
      qualityGradeName: "Loại 1",
      onHand: 4_000,
      inboundRemaining: 0,
      outboundRemaining: 12_000,
    });

    expect(ungraded.qualityGradeId).toBeNull();
    expect(ungraded.availableAfterCommitments.valueScaled).toBe(6_000);
    expect(graded.availableAfterCommitments.valueScaled).toBe(-8_000);
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
