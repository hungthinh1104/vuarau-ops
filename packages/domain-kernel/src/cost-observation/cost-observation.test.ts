import { describe, expect, it } from "vitest";
import { recordCostObservationCommandSchema } from "@vuarau/domain-contracts";
import { ACTOR_ID, COMMAND_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { decideRecordCostObservation } from "./index.ts";

const occurredAt = "2026-08-03T01:00:00.000Z";
const recordedAt = "2026-08-03T01:00:01.000Z";
const id = (suffix: string) => `90000000-0000-4000-8000-${suffix}`;

const command = (label: string, overrides: Record<string, unknown> = {}) =>
  recordCostObservationCommandSchema.parse({
    commandId: COMMAND_ID,
    idempotencyKey: `cost-observation-${label}`,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt,
    payload: {
      costObservationId: id("000000000001"),
      kind: "spoilage",
      caseKind: "normal",
      description: "Một sọt bị dập sau khi vận chuyển.",
      participantWording: "Chị nói sọt này đã bị dập từ lúc xuống xe.",
      facts: {
        amount: { amountMinor: 125_000, currency: "VND" },
        quantity: { valueScaled: 2_500, unit: "kg" },
        productId: null,
        qualityGradeId: null,
        sourceReference: "note://receiving/001",
      },
      evidenceReferences: ["photo://receiving/001"],
      relatedObservationId: null,
      ...overrides,
    },
  });

describe("cost observation domain", () => {
  it("BR-EVIDENCE-001 / TC-EVIDENCE-015 — preserves source-linked facts without effects", () => {
    const result = decideRecordCostObservation(command("normal"), recordedAt, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observation.facts).toEqual({
      amount: { amountMinor: 125_000, currency: "VND" },
      quantity: { valueScaled: 2_500, unit: "kg" },
      productId: null,
      qualityGradeId: null,
      sourceReference: "note://receiving/001",
    });
    expect(result.value.observation.evidenceReferences).toEqual(["photo://receiving/001"]);
    expect(result.value.audit.after).toMatchObject({
      kind: "spoilage",
      caseKind: "normal",
      hasAmount: true,
      hasQuantity: true,
    });
  });

  it("BR-EVIDENCE-002 / TC-EVIDENCE-016 — correction is a new linked observation", () => {
    const targetId = id("000000000002");
    const result = decideRecordCostObservation(
      command("correction", {
        costObservationId: id("000000000003"),
        caseKind: "correction",
        relatedObservationId: targetId,
      }),
      recordedAt,
      true,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observation.id).toBe(id("000000000003"));
    expect(result.value.observation.relatedObservationId).toBe(targetId);
  });

  it("BR-EVIDENCE-003 / TC-EVIDENCE-017 — refuses an invalid correction link", () => {
    const missingTarget = decideRecordCostObservation(
      command("missing-target", {
        caseKind: "correction",
        relatedObservationId: null,
      }),
      recordedAt,
      false,
    );
    const nonCorrectionLink = decideRecordCostObservation(
      command("non-correction-link", {
        relatedObservationId: id("000000000004"),
      }),
      recordedAt,
      true,
    );

    expect(missingTarget.ok).toBe(false);
    if (!missingTarget.ok) {
      expect(missingTarget.error.code).toBe("COST_OBSERVATION_CORRECTION_TARGET_REQUIRED");
    }
    expect(nonCorrectionLink.ok).toBe(false);
    if (!nonCorrectionLink.ok) {
      expect(nonCorrectionLink.error.code).toBe("COST_OBSERVATION_CORRECTION_LINK_INVALID");
    }
  });
});
