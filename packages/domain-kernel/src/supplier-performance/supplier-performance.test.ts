import type {
  SupplierEvaluationPolicyDefinition,
  SupplierObservationDto,
  SupplierObservationId,
  SupplierId,
  WorkspaceId,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import { describe, expect, it } from "vitest";
import { calculateSupplierPerformance } from "./index.ts";

const workspaceId = "00000000-0000-0000-0000-000000000001" as WorkspaceId;
const supplierId = "00000000-0000-0000-0000-000000000002" as SupplierId;
const policyVersionId = "00000000-0000-0000-0000-000000000003" as WorkspacePolicyVersionId;

const policy: SupplierEvaluationPolicyDefinition = {
  contractVersion: 1,
  parameters: {
    strategy: "observed_outcomes_summary",
    windowDays: 30,
    minimumObservationCount: 1,
  },
};

function observation(
  id: string,
  overrides: Partial<SupplierObservationDto["facts"]> = {},
): SupplierObservationDto {
  return {
    id: id as SupplierObservationId,
    workspaceId,
    kind: "actual_quantity",
    caseKind: "normal",
    description: "Nguồn quan sát test",
    participantWording: "Nhà cung cấp xác nhận",
    facts: {
      supplierId,
      productId: null,
      qualityGradeId: null,
      role: null,
      sourceArea: null,
      pickupResponsibility: null,
      packingResponsibility: null,
      transportResponsibility: null,
      expectedLeadTimeText: null,
      paymentArrangement: null,
      traceabilityLevel: null,
      promisedQuantity: null,
      actualQuantity: null,
      acceptedQuantity: null,
      rejectedQuantity: null,
      expectedAt: null,
      actualAt: null,
      price: null,
      claimReference: null,
      observationReference: null,
      ...overrides,
    },
    evidenceReferences: ["notebook://supplier-performance-test"],
    relatedObservationId: null,
    transactionTime: "2026-08-01T02:00:00.000Z",
    recordedAt: "2026-08-01T02:00:01.000Z",
    actorId: "00000000-0000-0000-0000-000000000004" as SupplierObservationDto["actorId"],
    commandId: "00000000-0000-0000-0000-000000000005" as SupplierObservationDto["commandId"],
  };
}

function calculate(observations: readonly SupplierObservationDto[]) {
  return calculateSupplierPerformance({
    workspaceId,
    supplierId,
    asOf: "2026-08-04T00:00:00.000Z",
    policy,
    policyVersionId,
    policyVersion: 2,
    observations,
  });
}

describe("supplier performance", () => {
  it("derives exact quantity rates, timing and source lineage from observations", () => {
    const result = calculate([
      observation("00000000-0000-0000-0000-000000000010", {
        promisedQuantity: { valueScaled: 100_000, unit: "kg" },
        actualQuantity: { valueScaled: 90_000, unit: "kg" },
        acceptedQuantity: { valueScaled: 80_000, unit: "kg" },
        rejectedQuantity: { valueScaled: 10_000, unit: "kg" },
        expectedAt: "2026-08-02T02:00:00.000Z",
        actualAt: "2026-08-02T01:00:00.000Z",
      }),
      observation("00000000-0000-0000-0000-000000000011", {
        expectedAt: "2026-08-03T02:00:00.000Z",
        actualAt: "2026-08-03T03:00:00.000Z",
      }),
    ]);

    expect(result).toMatchObject({
      status: "available",
      policyVersionId,
      policyVersion: 2,
      sourceObservationIds: [
        "00000000-0000-0000-0000-000000000010",
        "00000000-0000-0000-0000-000000000011",
      ],
      timing: { measuredCount: 2, onTimeCount: 1, lateCount: 1 },
    });
    expect(result.quantityMetrics).toEqual([
      {
        unit: "kg",
        promisedQuantity: { valueScaled: 100_000, unit: "kg" },
        actualQuantity: { valueScaled: 90_000, unit: "kg" },
        acceptedQuantity: { valueScaled: 80_000, unit: "kg" },
        rejectedQuantity: { valueScaled: 10_000, unit: "kg" },
        fulfilmentRateBasisPoints: 9_000,
        acceptanceRateBasisPoints: 8_889,
      },
    ]);
  });

  it("supersedes corrected observations without double counting", () => {
    const correction = {
      ...observation("00000000-0000-0000-0000-000000000013", {
        actualQuantity: { valueScaled: 80_000, unit: "kg" },
      }),
      caseKind: "correction" as const,
      relatedObservationId: "00000000-0000-0000-0000-000000000012" as SupplierObservationId,
      transactionTime: "2026-08-02T03:00:00.000Z",
      recordedAt: "2026-08-02T03:00:01.000Z",
    };
    const result = calculate([
      observation("00000000-0000-0000-0000-000000000012", {
        actualQuantity: { valueScaled: 90_000, unit: "kg" },
      }),
      correction,
    ]);

    expect(result.status).toBe("available");
    expect(result.sourceObservationIds).toEqual(["00000000-0000-0000-0000-000000000013"]);
    expect(result.quantityMetrics[0]?.actualQuantity).toEqual({
      valueScaled: 80_000,
      unit: "kg",
    });
  });

  it("fails closed when evidence is below the approved minimum", () => {
    const result = calculate([observation("00000000-0000-0000-0000-000000000014")]);

    expect(result).toMatchObject({
      status: "unavailable",
      diagnostics: ["insufficient_supplier_observations"],
      quantityMetrics: [],
      timing: null,
    });
  });
});
