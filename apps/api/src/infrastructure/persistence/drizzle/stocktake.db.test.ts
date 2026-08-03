import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { StocktakeSessionId } from "@vuarau/domain-contracts";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { adjustInventory } from "../../../modules/inventory/inventory.handlers.ts";
import { getStocktake } from "../../../modules/inventory/inventory.queries.ts";
import {
  approveStocktake,
  recordStocktakeCount,
  reopenStocktake,
  startStocktake,
} from "../../../modules/inventory/stocktake.handlers.ts";

describe.skipIf(skipWithoutDatabase())("stocktake against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;

  const context = (): CommandContext => ({
    deps,
    principal: { actorId: ctx.actorId, subject: ctx.subject },
  });
  const command = (label: string) => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `stocktake-db-${label}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt: "2026-07-20T05:00:00.000Z",
  });

  beforeEach(async () => {
    ctx = await createDbTestContext(`stocktake-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-07-20T11:00:00.000Z" as never },
    };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("TC-STOCKTAKE-003 preserves policy lineage and exact compensation in PostgreSQL", async () => {
    const productId = ctx.productIds[0]!;
    const policyVersionId = crypto.randomUUID();
    expect(
      (
        await createWorkspacePolicyDraft(context(), {
          ...command("policy-draft"),
          payload: {
            policyVersionId,
            policyKind: "stocktake_variance",
            version: 1,
            effectiveFrom: "2026-07-01T00:00:00.000Z",
            effectiveTo: null,
            definition: {
              contractVersion: 1,
              parameters: { strategy: "absolute_count", allowReopen: true },
            },
            evidenceReferences: [],
            reason: "Policy kiểm kê PostgreSQL.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await approveWorkspacePolicy(context(), {
          ...command("policy-approve"),
          payload: {
            policyVersionId,
            evidenceReferences: ["field://stocktake/postgres-001"],
            reason: "Đã duyệt policy kiểm kê.",
          },
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await adjustInventory(context(), {
          ...command("opening"),
          payload: {
            adjustmentId: crypto.randomUUID(),
            productId,
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 30_000, unit: "kg" },
            direction: "increase",
            reasonCode: "opening_balance",
            reason: "Tồn đầu kỳ PostgreSQL.",
          },
        })
      ).ok,
    ).toBe(true);

    const stocktakeSessionId = crypto.randomUUID() as StocktakeSessionId;
    const started = await startStocktake(context(), {
      ...command("start"),
      payload: {
        stocktakeSessionId,
        asOf: "2026-07-20T05:00:00.000Z",
        scopeReference: "warehouse://postgres",
        note: null,
        evidenceReferences: ["photo://stocktake/postgres-001"],
      },
    });
    expect(started).toMatchObject({ ok: true, value: { version: 1, policyVersionId } });

    const count = await recordStocktakeCount(context(), {
      ...command("count"),
      payload: {
        stocktakeCountId: crypto.randomUUID(),
        stocktakeSessionId,
        productId,
        qualityGradeId: ctx.qualityGradeId,
        qualityGradeName: "Loại 1",
        quantity: { valueScaled: 25_000, unit: "kg" },
        supersedesCountId: null,
        evidenceReferences: ["photo://stocktake/postgres-001"],
      },
    });
    expect(count).toMatchObject({ ok: true, value: { version: 2 } });

    const approved = await approveStocktake(context(), {
      ...command("approve"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 2,
        evidenceReferences: ["review://stocktake/postgres-001"],
        reason: "Đã chốt kiểm kê PostgreSQL.",
      },
    });
    expect(approved).toMatchObject({ ok: true, value: { status: "approved", version: 3 } });

    const reopened = await reopenStocktake(context(), {
      ...command("reopen"),
      payload: {
        stocktakeSessionId,
        expectedVersion: 3,
        evidenceReferences: ["review://stocktake/postgres-002"],
        reason: "Cần kiểm tra lại chênh lệch.",
      },
    });
    expect(reopened).toMatchObject({ ok: true, value: { status: "reopened", version: 4 } });

    const read = await getStocktake(context(), {
      workspaceId: ctx.workspaceId,
      stocktakeSessionId,
    });
    expect(read).toMatchObject({
      ok: true,
      value: {
        status: "reopened",
        policyVersionId,
        counts: [{ quantity: { valueScaled: 25_000 } }],
      },
    });
  });
});
