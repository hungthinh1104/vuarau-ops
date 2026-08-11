import { describe, expect, it } from "vitest";
import {
  actorIdSchema,
  commandIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
  recordStocktakeCountCommandSchema,
  stocktakeSessionIdSchema,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "@vuarau/domain-contracts";
import type { StocktakeSessionState } from "../shared/state.ts";
import { decideRecordStocktakeCount } from "./stocktake.ts";

const workspaceId = workspaceIdSchema.parse("00000000-0000-4000-8000-000000000001");
const actorId = actorIdSchema.parse("00000000-0000-4000-8000-000000000002");
const productId = productIdSchema.parse("00000000-0000-4000-8000-000000000003");
const qualityGradeId = qualityGradeIdSchema.parse("00000000-0000-4000-8000-000000000004");
const sessionId = stocktakeSessionIdSchema.parse("00000000-0000-4000-8000-000000000005");
const policyVersionId = workspacePolicyVersionIdSchema.parse(
  "00000000-0000-4000-8000-000000000006",
);

const session: StocktakeSessionState = {
  id: sessionId,
  workspaceId,
  asOf: "2026-07-20T05:00:00.000Z",
  scopeReference: "warehouse://main",
  note: null,
  status: "draft",
  version: 1,
  policyVersionId,
  counts: [],
  varianceMovementIds: [],
  transactionTime: "2026-07-20T05:00:00.000Z",
  recordedAt: "2026-07-20T05:00:00.000Z",
  actorId,
  commandId: commandIdSchema.parse("00000000-0000-4000-8000-000000000007"),
  evidenceReferences: [],
};

function countCommand(countId: string, supersedesCountId: string | null) {
  return recordStocktakeCountCommandSchema.parse({
    commandId: crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
    workspaceId,
    actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
    payload: {
      stocktakeCountId: countId,
      stocktakeSessionId: sessionId,
      productId,
      qualityGradeId,
      qualityGradeName: "Loại 1",
      quantity: { valueScaled: 10_000, unit: "kg" },
      supersedesCountId,
      evidenceReferences: [],
    },
  });
}

describe("stocktake correction lineage", () => {
  it("rejects a second correction fork from an already superseded count", () => {
    const first = decideRecordStocktakeCount({
      session,
      existingCounts: [],
      command: countCommand("00000000-0000-4000-8000-000000000010", null),
      recordedAt: "2026-07-20T05:01:00.000Z",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = decideRecordStocktakeCount({
      session: first.value.session,
      existingCounts: first.value.session.counts,
      command: countCommand("00000000-0000-4000-8000-000000000011", first.value.count.id),
      recordedAt: "2026-07-20T05:02:00.000Z",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const fork = decideRecordStocktakeCount({
      session: second.value.session,
      existingCounts: second.value.session.counts,
      command: countCommand("00000000-0000-4000-8000-000000000012", first.value.count.id),
      recordedAt: "2026-07-20T05:03:00.000Z",
    });
    expect(fork).toMatchObject({
      ok: false,
      error: { code: "STOCKTAKE_COUNT_INVALID" },
    });
  });
});
