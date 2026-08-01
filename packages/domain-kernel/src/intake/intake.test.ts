import { describe, expect, it } from "vitest";
import {
  recordGoodsArrivalCommandSchema,
  recordQualityDispositionCommandSchema,
  recordQualityInspectionCommandSchema,
  reverseQualityDispositionCommandSchema,
  weighingObservationSchema,
  type GoodsArrivalDto,
  type QualityDispositionSourceSummaryDto,
} from "@vuarau/domain-contracts";
import { ACTOR_ID, COMMAND_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import {
  decideRecordGoodsArrival,
  decideRecordQualityDisposition,
  decideRecordQualityInspection,
  decideReverseQualityDisposition,
} from "./index.ts";

const occurredAt = "2026-07-20T01:00:00.000Z";
const recordedAt = "2026-07-20T01:00:01.000Z";
const id = (suffix: string) => `90000000-0000-4000-8000-${suffix}`;
const envelope = (key: string) => ({
  commandId: COMMAND_ID,
  idempotencyKey: `intake-${key}-key`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt,
});

const arrivalCommand = () =>
  recordGoodsArrivalCommandSchema.parse({
    ...envelope("arrival"),
    payload: {
      arrivalId: id("000000000001"),
      supplierId: id("000000000002"),
      purchaseId: null,
      vehicleReference: "51C-123.45",
      lines: [
        {
          arrivalLineId: id("000000000003"),
          purchaseLineId: null,
          productId: id("000000000004"),
          productName: "Cải ngọt",
          arrivedQuantity: { valueScaled: 100_000, unit: "kg" },
          weighing: {
            containerCount: 10,
            grossWeight: { valueScaled: 105_000, unit: "kg" },
            tareWeight: { valueScaled: 5_000, unit: "kg" },
            netWeight: { valueScaled: 100_000, unit: "kg" },
          },
          supplierLotCode: "L-001",
          note: null,
        },
      ],
      note: null,
    },
  });

function arrival(): GoodsArrivalDto {
  const result = decideRecordGoodsArrival(arrivalCommand(), recordedAt);
  if (!result.ok) throw new Error("arrival setup failed");
  return result.value.arrival;
}

function sourceSummary(eligible = 60_000): QualityDispositionSourceSummaryDto {
  const row = arrival().lines[0]!;
  return {
    source: { type: "arrival_line", arrivalLineId: row.arrivalLineId },
    sourceQuantity: row.arrivedQuantity,
    allocatedQuantity: { valueScaled: 20_000, unit: "kg" },
    remainingQuantity: { valueScaled: 80_000, unit: "kg" },
    inspectedQuantity: { valueScaled: 80_000, unit: "kg" },
    eligibleQuantity: { valueScaled: eligible, unit: "kg" },
    productId: row.productId,
    productName: row.productName,
    purchaseId: null,
    purchaseLineId: null,
    supplierId: arrival().supplierId,
  };
}

describe("intake and quality domain", () => {
  it("TC-INTAKE-001 — requires exact gross minus tare equals net", () => {
    expect(
      weighingObservationSchema.safeParse({
        containerCount: 4,
        grossWeight: { valueScaled: 100_000, unit: "kg" },
        tareWeight: { valueScaled: 5_000, unit: "kg" },
        netWeight: { valueScaled: 95_000, unit: "kg" },
      }).success,
    ).toBe(true);
    expect(
      weighingObservationSchema.safeParse({
        containerCount: 4,
        grossWeight: { valueScaled: 100_000, unit: "kg" },
        tareWeight: { valueScaled: 5_000, unit: "kg" },
        netWeight: { valueScaled: 96_000, unit: "kg" },
      }).success,
    ).toBe(false);
  });

  it("TC-INTAKE-002 — records immutable arrival command identity and weighing", () => {
    const result = decideRecordGoodsArrival(arrivalCommand(), recordedAt);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.arrival.commandId).toBe(COMMAND_ID);
    expect(result.value.arrival.lines[0]?.weighing?.netWeight.valueScaled).toBe(100_000);
  });

  it("TC-INTAKE-003 — refuses duplicate issue code snapshots in one inspection", () => {
    const line = arrival().lines[0]!;
    const issue = {
      qualityIssueCodeId: id("000000000010"),
      qualityIssueCode: "DAP",
      qualityIssueName: "Dập",
      severity: "moderate" as const,
      note: null,
    };
    const command = recordQualityInspectionCommandSchema.parse({
      ...envelope("inspection"),
      payload: {
        inspectionId: id("000000000011"),
        arrivalLineId: line.arrivalLineId,
        inspectedQuantity: { valueScaled: 50_000, unit: "kg" },
        issues: [issue, issue],
        note: null,
        evidenceReferences: [],
      },
    });
    const result = decideRecordQualityInspection(command, line, true, recordedAt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("QUALITY_INSPECTION_INVALID");
  });

  it("TC-INTAKE-004 — disposition cannot exceed inspected eligible quantity", () => {
    const command = recordQualityDispositionCommandSchema.parse({
      ...envelope("disposition"),
      payload: {
        dispositionId: id("000000000020"),
        source: sourceSummary().source,
        allocations: [
          {
            allocationId: id("000000000021"),
            outcome: "accepted",
            quantity: { valueScaled: 70_000, unit: "kg" },
            qualityGradeId: null,
            qualityGradeName: null,
            note: null,
          },
        ],
        note: null,
      },
    });
    const result = decideRecordQualityDisposition(command, sourceSummary(), true, recordedAt);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.error.code).toBe("QUALITY_DISPOSITION_QUANTITY_EXCEEDS_REMAINING");
  });

  it("TC-INTAKE-005 — quarantine resolution cannot quarantine the same quantity again", () => {
    const command = recordQualityDispositionCommandSchema.parse({
      ...envelope("quarantine"),
      payload: {
        dispositionId: id("000000000030"),
        source: {
          type: "quarantine_allocation",
          allocationId: id("000000000031"),
        },
        allocations: [
          {
            allocationId: id("000000000032"),
            outcome: "quarantined",
            quantity: { valueScaled: 10_000, unit: "kg" },
            qualityGradeId: null,
            qualityGradeName: null,
            note: null,
          },
        ],
        note: null,
      },
    });
    const source = {
      ...sourceSummary(10_000),
      source: command.payload.source,
      sourceQuantity: { valueScaled: 10_000, unit: "kg" as const },
      allocatedQuantity: { valueScaled: 0, unit: "kg" as const },
      remainingQuantity: { valueScaled: 10_000, unit: "kg" as const },
      inspectedQuantity: null,
      eligibleQuantity: { valueScaled: 10_000, unit: "kg" as const },
    };
    const result = decideRecordQualityDisposition(command, source, true, recordedAt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("QUALITY_DISPOSITION_INVALID");
  });

  it("TC-INTAKE-006 — disposition with downstream quarantine resolution cannot reverse", () => {
    const record = recordQualityDispositionCommandSchema.parse({
      ...envelope("record-for-reverse"),
      payload: {
        dispositionId: id("000000000040"),
        source: sourceSummary().source,
        allocations: [
          {
            allocationId: id("000000000041"),
            outcome: "quarantined",
            quantity: { valueScaled: 10_000, unit: "kg" },
            qualityGradeId: null,
            qualityGradeName: null,
            note: null,
          },
        ],
        note: null,
      },
    });
    const recorded = decideRecordQualityDisposition(record, sourceSummary(), true, recordedAt);
    if (!recorded.ok) throw new Error("disposition setup failed");
    const reverse = reverseQualityDispositionCommandSchema.parse({
      ...envelope("reverse"),
      payload: {
        reversalId: id("000000000042"),
        dispositionId: recorded.value.disposition.id,
        reason: "Ghi nhầm",
      },
    });
    const result = decideReverseQualityDisposition(reverse, recorded.value.disposition, 1, recordedAt);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("QUALITY_DISPOSITION_HAS_DOWNSTREAM_FACTS");
  });
});
