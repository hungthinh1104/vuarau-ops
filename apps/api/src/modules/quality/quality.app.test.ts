import { describe, expect, it } from "vitest";
import type { QualityGradeId } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  FOREIGN_ACTOR_ID,
  LATER_TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness } from "../../testing/command-test-harness.ts";
import { createQualityGrade, deactivateQualityGrade } from "./quality.handlers.ts";
import { getQualityGrade, listQualityGrades } from "./quality.queries.ts";

const input = (qualityGradeId: QualityGradeId) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: `quality-${qualityGradeId}`,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: LATER_TRANSACTION_TIME,
  payload: { qualityGradeId, name: "Dạt", sortOrder: 30 },
});

describe("M23 configurable QualityGrade", () => {
  it("creates, reads, orders and deactivates a workspace grade with audit evidence", async () => {
    const harness = createHarness();
    const qualityGradeId = crypto.randomUUID() as QualityGradeId;
    const created = await createQualityGrade(harness.ctx, input(qualityGradeId));
    expect(created.ok && created.value).toMatchObject({
      id: qualityGradeId,
      name: "Dạt",
      isActive: true,
      version: 1,
    });
    const listed = await listQualityGrades(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    });
    expect(listed.ok && listed.value.items.map((grade) => grade.name)).toEqual(["Loại 1", "Dạt"]);
    const deactivated = await deactivateQualityGrade(harness.ctx, {
      ...input(qualityGradeId),
      commandId: crypto.randomUUID(),
      idempotencyKey: `quality-deactivate-${qualityGradeId}`,
      expectedVersion: 1,
      payload: { qualityGradeId, reason: "Không còn dùng" },
    });
    expect(deactivated.ok && deactivated.value).toMatchObject({ isActive: false, version: 2 });
    expect(harness.db.auditRecords().map((entry) => entry.action)).toContain(
      "quality_grade.created",
    );
    expect(harness.db.auditRecords().map((entry) => entry.action)).toContain(
      "quality_grade.deactivated",
    );
  });

  it("keeps management owner/warehouse-only and reads workspace-scoped", async () => {
    const harness = createHarness();
    const qualityGradeId = crypto.randomUUID() as QualityGradeId;
    const denied = await createQualityGrade(harness.contextFor(ACCOUNTANT_ACTOR_ID), {
      ...input(qualityGradeId),
      actorId: ACCOUNTANT_ACTOR_ID,
    });
    expect(denied).toMatchObject({ ok: false, error: { code: "PERMISSION_DENIED" } });
    const foreign = await getQualityGrade(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: WORKSPACE_ID,
      qualityGradeId,
    });
    expect(foreign).toMatchObject({ ok: false, error: { code: "WORKSPACE_ACCESS_DENIED" } });
  });
});
