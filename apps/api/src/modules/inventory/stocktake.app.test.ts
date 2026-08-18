import { beforeEach, describe, expect, it } from "vitest";
import {
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  QUALITY_GRADE_1_ID,
  TRANSACTION_TIME,
  LATER_TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import type { StocktakeSessionId } from "@vuarau/domain-contracts";
import { defaultWorkspaceOperationalProfile } from "@vuarau/domain-contracts";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { adjustInventory } from "./inventory.handlers.ts";
import { deactivateQualityGrade } from "../quality/quality.handlers.ts";
import {
  approveStocktake,
  recordStocktakeCount,
  reopenStocktake,
  startStocktake,
} from "./stocktake.handlers.ts";
import {
  getActiveStocktake,
  getLatestStocktakeByScope,
  getStocktake,
  getStocktakePreflight,
  getStocktakePreview,
} from "./inventory.queries.ts";

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
        scopeReference: "product:" + PRODUCT_CA_CHUA_ID,
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
    expect(
      await deactivateQualityGrade(harness.ctx, {
        ...envelope("retire-grade"),
        expectedVersion: 1,
        payload: {
          qualityGradeId: QUALITY_GRADE_1_ID,
          reason: "Không còn nhận lô mới theo hạng này.",
        },
      }),
    ).toMatchObject({ ok: true, value: { isActive: false } });

    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;
    const started = await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: "product:" + PRODUCT_CA_CHUA_ID,
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

    const preview = await getStocktakePreview(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.value === null) throw new Error("Preview failed");

    expect(preview.value.rows).toEqual([
      {
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        unit: "kg",
        expectedQuantityScaled: 30_000,
        countedQuantityScaled: 25_000,
        varianceScaled: -5_000,
        activeCountId: countId,
      },
    ]);

    const approved = await approveStocktake(harness.ctx, {
      ...envelope("approve"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 2,
        expectedPreviewHash: preview.value.previewHash,
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
      value: {
        status: "reopened",
        policyVersionId,
        counts: [{ id: countId }],
        activeCounts: [{ id: countId }],
      },
    });
  });

  it("TC-STOCKTAKE-003 prevents concurrent open stocktakes for same scope reference", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const session1Id = crypto.randomUUID() as StocktakeSessionId;

    const first = await startStocktake(harness.ctx, {
      ...envelope("start-1"),
      payload: {
        stocktakeSessionId: session1Id,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: "Phiên 1",
        evidenceReferences: [],
      },
    });
    expect(first.ok).toBe(true);

    const second = await startStocktake(harness.ctx, {
      ...envelope("start-2"),
      payload: {
        stocktakeSessionId: crypto.randomUUID() as StocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: "Phiên 2",
        evidenceReferences: [],
      },
    });
    expect(second).toMatchObject({
      ok: false,
      error: { code: "STOCKTAKE_SCOPE_IN_PROGRESS" },
    });
  });

  it("TC-STOCKTAKE-004 superseding count updates active count chain and variance calculation", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    const count1Id = crypto.randomUUID();
    await recordStocktakeCount(harness.ctx, {
      ...envelope("count-1"),
      payload: {
        stocktakeCountId: count1Id,
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 20_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });

    const count2Id = crypto.randomUUID();
    const superseded = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-2"),
      payload: {
        stocktakeCountId: count2Id,
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 22_000, unit: "kg" },
        supersedesCountId: count1Id,
        evidenceReferences: [],
      },
    });
    expect(superseded.ok).toBe(true);
    if (!superseded.ok) return;

    expect(superseded.value.counts.length).toBe(2);
    expect(superseded.value.activeCounts.length).toBe(1);
    expect(superseded.value.activeCounts[0]!.id).toBe(count2Id);
    expect(superseded.value.activeCounts[0]!.quantity.valueScaled).toBe(22_000);

    const preview = await getStocktakePreview(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.value === null) throw new Error("Preview failed");
    expect(preview.value.rows[0]!.activeCountId).toBe(count2Id);
    expect(preview.value.rows[0]!.countedQuantityScaled).toBe(22_000);
  });

  it("TC-STOCKTAKE-005 stocktake preview computes variance against expected as of stocktake start time", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;

    // Opening balance at TRANSACTION_TIME
    const adj1 = await adjustInventory(harness.ctx, {
      ...envelope("opening"),
      occurredAt: TRANSACTION_TIME,
      payload: {
        adjustmentId: crypto.randomUUID(),
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 30_000, unit: "kg" },
        direction: "increase",
        reasonCode: "opening_balance",
        reason: "Initial stock",
      },
    });
    expect(adj1.ok).toBe(true);

    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;
    // Stocktake starts at TRANSACTION_TIME
    const started = await startStocktake(harness.ctx, {
      ...envelope("start"),
      occurredAt: TRANSACTION_TIME,
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });
    expect(started.ok).toBe(true);

    // Concurrent movement at LATER_TRANSACTION_TIME adds 10kg
    const adj2 = await adjustInventory(harness.ctx, {
      ...envelope("receipt-later"),
      occurredAt: LATER_TRANSACTION_TIME,
      payload: {
        adjustmentId: crypto.randomUUID(),
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 10_000, unit: "kg" },
        direction: "increase",
        reasonCode: "other",
        reason: "New stock after start",
      },
    });
    expect(adj2).toMatchObject({ ok: true });

    // Record count of 25kg
    const countId = crypto.randomUUID();
    const counted = await recordStocktakeCount(harness.ctx, {
      ...envelope("count"),
      occurredAt: LATER_TRANSACTION_TIME,
      payload: {
        stocktakeCountId: countId,
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 25_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(counted.ok).toBe(true);

    const preview = await getStocktakePreview(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.value === null) throw new Error("Preview failed");

    // Expected at TRANSACTION_TIME is 30kg, counted is 25kg => variance is -5kg (NOT 40kg -> -15kg)
    expect(preview.value.rows[0]!.expectedQuantityScaled).toBe(30_000);
    expect(preview.value.rows[0]!.countedQuantityScaled).toBe(25_000);
    expect(preview.value.rows[0]!.varianceScaled).toBe(-5_000);
  });

  it("TC-STOCKTAKE-006 approve fails with STOCKTAKE_PREVIEW_STALE if previewHash does not match", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    await recordStocktakeCount(harness.ctx, {
      ...envelope("count"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 25_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });

    const approveResult = await approveStocktake(harness.ctx, {
      ...envelope("approve"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 2,
        expectedPreviewHash: "stale-preview-hash-12345",
        evidenceReferences: [],
        reason: "Approve with wrong hash",
      },
    });

    expect(approveResult).toMatchObject({
      ok: false,
      error: { code: "STOCKTAKE_PREVIEW_STALE" },
    });
  });

  it("TC-STOCKTAKE-007 reopen stocktake fails if another session is currently open for the same scope", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const session1Id = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start-1"),
      payload: {
        stocktakeSessionId: session1Id,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    await recordStocktakeCount(harness.ctx, {
      ...envelope("count-1"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId: session1Id,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 25_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });

    const preview1 = await getStocktakePreview(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId: session1Id,
    });
    if (!preview1.ok || preview1.value === null) throw new Error("Preview 1 failed");

    await approveStocktake(harness.ctx, {
      ...envelope("approve-1"),
      payload: {
        stocktakeSessionId: session1Id,
        expectedVersion: 2,
        expectedPreviewHash: preview1.value.previewHash,
        evidenceReferences: [],
        reason: "Approve session 1",
      },
    });

    // Start a new session 2 for the same scope
    const session2Id = crypto.randomUUID() as StocktakeSessionId;
    await startStocktake(harness.ctx, {
      ...envelope("start-2"),
      payload: {
        stocktakeSessionId: session2Id,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    // Reopening session 1 should now be refused because session 2 is open!
    const reopen1 = await reopenStocktake(harness.ctx, {
      ...envelope("reopen-1"),
      payload: {
        stocktakeSessionId: session1Id,
        expectedVersion: 3,
        evidenceReferences: [],
        reason: "Reopen session 1",
      },
    });

    expect(reopen1).toMatchObject({
      ok: false,
      error: { code: "STOCKTAKE_SCOPE_IN_PROGRESS" },
    });
  });

  it("TC-STOCKTAKE-008 preflight query returns canStart false when policy is unavailable and true when valid", async () => {
    const preflight1 = await getStocktakePreflight(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: TRANSACTION_TIME,
    });
    expect(preflight1).toMatchObject({
      ok: true,
      value: { canStart: false, policyVersionId: null, reasonCode: "STOCKTAKE_POLICY_UNAVAILABLE" },
    });

    const policyVersionId = await approveAbsoluteCountPolicy(true);

    const preflight2 = await getStocktakePreflight(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: TRANSACTION_TIME,
    });
    expect(preflight2).toMatchObject({
      ok: true,
      value: { canStart: true, policyVersionId, reasonCode: null, message: null },
    });
  });

  it("TC-STOCKTAKE-009 active and latest queries return correct session DTO with activeCounts", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const session1Id = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start-1"),
      payload: {
        stocktakeSessionId: session1Id,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    const count1Id = crypto.randomUUID();
    await recordStocktakeCount(harness.ctx, {
      ...envelope("count-1"),
      payload: {
        stocktakeCountId: count1Id,
        stocktakeSessionId: session1Id,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 15_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });

    const active = await getActiveStocktake(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      scopeReference: scopeRef,
    });
    expect(active.ok).toBe(true);
    if (!active.ok || active.value === null) throw new Error("Active failed");
    expect(active.value.id).toBe(session1Id);
    expect(active.value.activeCounts.length).toBe(1);

    const latest = await getLatestStocktakeByScope(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      scopeReference: scopeRef,
    });
    expect(latest.ok).toBe(true);
    if (!latest.ok || latest.value === null) throw new Error("Latest failed");
    expect(latest.value.id).toBe(session1Id);
  });

  it("TC-STOCKTAKE-010 multiple distinct product counts in single session produce canonical preview hash", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "warehouse://multi";
    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    const count1 = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-chili"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_OT_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 10_000, unit: "thung" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(count1.ok).toBe(true);

    const count2 = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-tomato"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 20_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(count2.ok).toBe(true);

    const preview = await getStocktakePreview(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      stocktakeSessionId,
    });
    expect(preview.ok).toBe(true);
    if (!preview.ok || preview.value === null) throw new Error("Preview failed");

    // Rows must be canonically sorted by productId ASC
    expect(preview.value.rows.length).toBe(2);
    expect(preview.value.rows[0]!.productId < preview.value.rows[1]!.productId).toBe(true);
    expect(preview.value.previewHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("TC-STOCKTAKE-011 qualityGradeMode validation adheres to operational profile (required vs disabled)", async () => {
    await approveAbsoluteCountPolicy(true);
    const scopeRef = "product:" + PRODUCT_CA_CHUA_ID;
    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;

    await startStocktake(harness.ctx, {
      ...envelope("start"),
      payload: {
        stocktakeSessionId,
        asOf: TRANSACTION_TIME,
        scopeReference: scopeRef,
        note: null,
        evidenceReferences: [],
      },
    });

    // In required mode (default), counting without grade fails
    const missingGrade = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-no-grade"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: null,
        qualityGradeName: null,
        quantity: { valueScaled: 20_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(missingGrade).toMatchObject({
      ok: false,
      error: { code: "SALE_QUALITY_GRADE_REQUIRED" },
    });

    // Switch depot to disabled qualityGradeMode
    harness.db.setOperationalProfile({
      ...defaultWorkspaceOperationalProfile(WORKSPACE_ID),
      qualityGradeMode: "disabled",
    });

    // Now counting with grade fails
    const withGrade = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-with-grade"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: QUALITY_GRADE_1_ID,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 20_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(withGrade).toMatchObject({
      ok: false,
      error: { code: "QUALITY_GRADE_NOT_USED" },
    });

    // Counting without grade in disabled mode succeeds
    const validUngraded = await recordStocktakeCount(harness.ctx, {
      ...envelope("count-ungraded-ok"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId: PRODUCT_CA_CHUA_ID,
        qualityGradeId: null,
        qualityGradeName: null,
        quantity: { valueScaled: 20_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: [],
      },
    });
    expect(validUngraded.ok).toBe(true);
  });
});
