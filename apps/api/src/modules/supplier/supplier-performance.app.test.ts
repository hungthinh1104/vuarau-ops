import { beforeEach, describe, expect, it } from "vitest";
import type { SupplierObservationId, WorkspacePolicyVersionId } from "@vuarau/domain-contracts";
import {
  ACTOR_ID,
  FOREIGN_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  SUPPLIER_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { recordSupplierObservation } from "../evidence/evidence.handlers.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { getSupplierPerformance } from "./supplier-performance.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (key: string, actorId = ACTOR_ID, workspaceId = WORKSPACE_ID) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId,
  actorId,
  occurredAt: TRANSACTION_TIME,
});

async function approveSupplierEvaluationPolicy(): Promise<WorkspacePolicyVersionId> {
  const policyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
  const draft = await createWorkspacePolicyDraft(harness.ctx, {
    ...envelope("supplier-performance-policy-draft"),
    payload: {
      policyVersionId,
      policyKind: "supplier_evaluation",
      version: 1,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveTo: null,
      definition: {
        contractVersion: 1,
        parameters: {
          strategy: "observed_outcomes_summary",
          windowDays: 30,
          minimumObservationCount: 1,
        },
      },
      evidenceReferences: [],
      reason: "Đã thống nhất cửa sổ đánh giá nguồn cung.",
    },
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error(draft.error.message);
  const approved = await approveWorkspacePolicy(harness.ctx, {
    ...envelope("supplier-performance-policy-approve"),
    payload: {
      policyVersionId,
      evidenceReferences: ["field://supplier-performance/001"],
      reason: "Chủ vựa duyệt cách đọc dữ kiện giao và nhận.",
    },
  });
  expect(approved.ok).toBe(true);
  if (!approved.ok) throw new Error(approved.error.message);
  return policyVersionId;
}

async function recordObservation(id: SupplierObservationId) {
  return recordSupplierObservation(harness.ctx, {
    ...envelope(`supplier-performance-observation-${id}`),
    payload: {
      supplierObservationId: id,
      kind: "actual_quantity",
      caseKind: "normal",
      description: "Đối chiếu chuyến giao ngày 22/07.",
      participantWording: "Nhà vườn xác nhận số lượng giao và nhận.",
      facts: {
        supplierId: SUPPLIER_ID,
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
        promisedQuantity: { valueScaled: 100_000, unit: "kg" },
        actualQuantity: { valueScaled: 90_000, unit: "kg" },
        acceptedQuantity: { valueScaled: 80_000, unit: "kg" },
        rejectedQuantity: { valueScaled: 10_000, unit: "kg" },
        expectedAt: "2026-07-22T02:00:00.000Z",
        actualAt: "2026-07-22T01:00:00.000Z",
        price: null,
        claimReference: null,
        observationReference: "notebook://supplier-performance/001",
      },
      evidenceReferences: ["notebook://supplier-performance/001"],
      relatedObservationId: null,
    },
  });
}

describe("supplier performance application read", () => {
  it("is unavailable without policy and derives only after explicit approval", async () => {
    const beforePolicy = await getSupplierPerformance(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId: SUPPLIER_ID,
      asOf: "2026-07-23T09:00:00.000Z",
    });
    expect(beforePolicy.ok).toBe(true);
    if (!beforePolicy.ok) return;
    expect(beforePolicy.value).toMatchObject({
      status: "unavailable",
      policyVersionId: null,
      diagnostics: ["no_effective_supplier_evaluation_policy"],
      quantityMetrics: [],
      timing: null,
    });

    const policyVersionId = await approveSupplierEvaluationPolicy();
    const recorded = await recordObservation(
      "00000000-0000-4000-8000-000000000021" as SupplierObservationId,
    );
    expect(recorded.ok).toBe(true);

    const performance = await getSupplierPerformance(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      supplierId: SUPPLIER_ID,
      asOf: "2026-07-23T09:00:00.000Z",
    });
    expect(performance.ok).toBe(true);
    if (!performance.ok) return;
    expect(performance.value).toMatchObject({
      status: "available",
      policyVersionId,
      strategy: "observed_outcomes_summary",
      measurementObservationCount: 1,
      timing: { measuredCount: 1, onTimeCount: 1, lateCount: 0 },
    });
    expect(performance.value.quantityMetrics[0]).toMatchObject({
      unit: "kg",
      fulfilmentRateBasisPoints: 9_000,
      acceptanceRateBasisPoints: 8_889,
    });
    expect(performance.value).not.toHaveProperty("score");
    expect(performance.value).not.toHaveProperty("recommendation");
  });

  it("keeps supplier performance workspace-scoped", async () => {
    const result = await getSupplierPerformance(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      supplierId: SUPPLIER_ID,
      asOf: "2026-07-23T09:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("SUPPLIER_NOT_FOUND");
  });
});
