import { describe, expect, it } from "vitest";
import { recordReconciliationObservationCommandSchema } from "@vuarau/domain-contracts";
import { ACTOR_ID, COMMAND_ID, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { decideRecordReconciliationObservation } from "./index.ts";

const occurredAt = "2026-08-03T01:00:00.000Z";
const recordedAt = "2026-08-03T01:00:01.000Z";
const id = (suffix: string) => `91000000-0000-4000-8000-${suffix}`;

const command = (label: string, overrides: Record<string, unknown> = {}) =>
  recordReconciliationObservationCommandSchema.parse({
    commandId: COMMAND_ID,
    idempotencyKey: `reconciliation-observation-${label}`,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt,
    payload: {
      reconciliationObservationId: id("000000000001"),
      kind: "inventory_count",
      caseKind: "normal",
      description: "Đếm thực tế tại khu sơ chế.",
      participantWording: "Phiếu đếm cuối ca ghi nhận số lượng quan sát được.",
      facts: {
        expectedAmount: null,
        observedAmount: null,
        expectedQuantity: { valueScaled: 10_000, unit: "kg" },
        observedQuantity: { valueScaled: 9_500, unit: "kg" },
        itemCount: 3,
        productId: null,
        qualityGradeId: null,
        scopeReference: "stocktake://domain-001",
      },
      evidenceReferences: ["photo://stocktake/domain-001"],
      relatedObservationId: null,
      ...overrides,
    },
  });

describe("reconciliation observation domain", () => {
  it("BR-EVIDENCE-004 / TC-EVIDENCE-027 — preserves expected and observed facts without a derived variance", () => {
    const result = decideRecordReconciliationObservation(
      command("normal"),
      recordedAt,
      null,
      false,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.observation.facts).toEqual({
      expectedAmount: null,
      observedAmount: null,
      expectedQuantity: { valueScaled: 10_000, unit: "kg" },
      observedQuantity: { valueScaled: 9_500, unit: "kg" },
      itemCount: 3,
      productId: null,
      qualityGradeId: null,
      scopeReference: "stocktake://domain-001",
    });
    expect(result.value.audit.after).toMatchObject({
      kind: "inventory_count",
      hasExpectedQuantity: true,
      hasObservedQuantity: true,
    });
    expect(result.value.observation).not.toHaveProperty("variance");
  });

  it("BR-EVIDENCE-005 / TC-EVIDENCE-028 — correction is a new linked observation", () => {
    const target = decideRecordReconciliationObservation(
      command("target"),
      recordedAt,
      null,
      false,
    );
    if (!target.ok) return;
    const targetId = target.value.observation.id;
    const result = decideRecordReconciliationObservation(
      command("correction", {
        reconciliationObservationId: id("000000000003"),
        caseKind: "correction",
        relatedObservationId: targetId,
      }),
      recordedAt,
      target.value.observation,
      false,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.observation.id).toBe(id("000000000003"));
      expect(result.value.observation.relatedObservationId).toBe(targetId);
    }
  });

  it("BR-EVIDENCE-006 / TC-EVIDENCE-029 — rejects missing or non-correction links", () => {
    const missingTarget = decideRecordReconciliationObservation(
      command("missing-target", {
        caseKind: "correction",
        relatedObservationId: null,
      }),
      recordedAt,
      null,
      false,
    );
    const nonCorrectionLink = decideRecordReconciliationObservation(
      command("non-correction-link", { relatedObservationId: id("000000000004") }),
      recordedAt,
      null,
      false,
    );

    expect(missingTarget.ok).toBe(false);
    if (!missingTarget.ok)
      expect(missingTarget.error.code).toBe(
        "RECONCILIATION_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      );
    expect(nonCorrectionLink.ok).toBe(false);
    if (!nonCorrectionLink.ok)
      expect(nonCorrectionLink.error.code).toBe(
        "RECONCILIATION_OBSERVATION_CORRECTION_LINK_INVALID",
      );
  });
});
