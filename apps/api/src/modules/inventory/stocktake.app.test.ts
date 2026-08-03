import { beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  QUALITY_GRADE_1_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { StocktakeSessionId } from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { adjustInventory } from "./inventory.handlers.ts";
import {
  approveStocktake,
  recordStocktakeCount,
  reopenStocktake,
  startStocktake,
} from "./stocktake.handlers.ts";
import { getStocktake } from "./inventory.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (label: string) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `stocktake-${label}-${crypto.randomUUID()}`,
  workspaceId: WORKSPACE_ID,
  actorId: harness.ctx.principal.actorId,
  occurredAt: TRANSACTION_TIME,
});

async function approveAbsoluteCountPolicy(allowReopen = true) {
  const policyVersionId = crypto.randomUUID();
  expect(
    await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope("policy-draft"),
      payload: {
        policyVersionId,
        policyKind: "stocktake_variance",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { strategy: "absolute_count", allowReopen },
        },
        evidenceReferences: [],
        reason: "Chốt chính sách kiểm kê tuyệt đối.",
      },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve"),
      payload: {
        policyVersionId,
        evidenceReferences: ["field://stocktake/001"],
        reason: "Chủ vựa phê duyệt chính sách kiểm kê.",
      },
    }),
  ).toMatchObject({ ok: true });
  return policyVersionId;
}

describe("stocktake commands", () => {
  it("TC-STOCKTAKE-001 refuses to start without an approved policy", async () => {
    const result = await startStocktake(harness.ctx, {
      ...envelope("missing-policy"),
      payload: {
        stocktakeSessionId: crypto.randomUUID(),
        asOf: TRANSACTION_TIME,
        scopeReference: "warehouse://main",
        note: null,
        evidenceReferences: [],
      },
    });
    expect(result).toMatchObject({
      ok: false,
      error: { code: "STOCKTAKE_POLICY_UNAVAILABLE" },
    });
  });

  it("TC-STOCKTAKE-002 records exact variance and compensates it on reopen", async () => {
    const policyVersionId = await approveAbsoluteCountPolicy(true);
    const adjustmentId = crypto.randomUUID();
    expect(
      await adjustInventory(harness.ctx, {
        ...envelope("opening-stock"),
        payload: {
          adjustmentId,
          productId: PRODUCT_CA_CHUA_ID,
          qualityGradeId: QUALITY_GRADE_1_ID,
          qualityGradeName: "Loại 1",
          quantity: { valueScaled: 30_000, unit: "kg" },
          direction: "increase",
          reasonCode: "opening_balance",
          reason: "Tồn đầu kỳ kiểm thử.",
        },
      }),
    ).toMatchObject({ ok: true });

    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;
    const started = await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: "warehouse://main",
        note: "Kiểm kê cuối ngày.",
        evidenceReferences: ["photo://stocktake/001"],
      },
    });
    expect(started).toMatchObject({
      ok: true,
      value: { status: "draft", version: 1, policyVersionId },
    });

    const countId = crypto.randomUUID();
    const counted = await recordStocktakeCount(harness.ctx, {
      ...envelope("count"),
      payload: {
        stocktakeCountId: countId,
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 25_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: ["photo://stocktake/001"],
      },
    });
    expect(counted).toMatchObject({ ok: true, value: { status: "draft", version: 2 } });

    const approved = await approveStocktake(harness.ctx, {
      ...envelope("approve"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 2,
        evidenceReferences: ["review://stocktake/001"],
        reason: "Đã đối chiếu số đếm thực tế.",
      },
    });
    expect(approved).toMatchObject({
      ok: true,
      value: { status: "approved", version: 3, varianceMovementIds: [expect.any(String)] },
    });
    expect(
      harness.db
        .inventoryMovementRecords()
        .reduce((total, movement) => total + movement.quantity.valueScaled, 0),
    ).toBe(25_000);

    const reopened = await reopenStocktake(harness.ctx, {
      ...envelope("reopen"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 3,
        evidenceReferences: ["review://stocktake/002"],
        reason: "Mở lại để kiểm tra chênh lệch.",
      },
    });
    expect(reopened).toMatchObject({ ok: true, value: { status: "reopened", version: 4 } });
    expect(
      harness.db
        .inventoryMovementRecords()
        .reduce((total, movement) => total + movement.quantity.valueScaled, 0),
    ).toBe(30_000);

    const read = await getStocktake(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId,
    });
    expect(read).toMatchObject({
      ok: true,
      value: { status: "reopened", policyVersionId, counts: [{ id: countId }] },
    });
  });
});
