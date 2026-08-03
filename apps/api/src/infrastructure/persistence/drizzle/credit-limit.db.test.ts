import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDbTestContext,
  createUnitOfWork,
  skipWithoutDatabase,
  type DbTestContext,
} from "@vuarau/db";
import type { CommandContext, CommandDeps } from "../../../modules/shared/command-pipeline.ts";
import { randomIdGenerator } from "../../clock.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
} from "../../../modules/policy/policy.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { getSale } from "../../../modules/sale/sale.queries.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";

describe.skipIf(skipWithoutDatabase())("credit control against PostgreSQL", () => {
  let ctx: DbTestContext;
  let deps: CommandDeps;
  let owner: CommandContext;

  const envelope = (key: string, occurredAt = "2026-07-20T05:00:00.000Z") => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: `${key}-${crypto.randomUUID()}`,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt,
  });

  beforeAll(async () => {
    ctx = await createDbTestContext(`credit-limit-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-04T00:00:00.000Z" },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  async function installPolicy(limit: number) {
    const policyVersionId = crypto.randomUUID();
    const draft = await createWorkspacePolicyDraft(owner, {
      ...envelope("db-credit-policy-draft", "2026-07-01T00:00:00.000Z"),
      payload: {
        policyVersionId,
        policyKind: "credit_limit",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: { mode: "hard_block", limit: { amountMinor: limit, currency: "VND" } },
        },
        evidenceReferences: [],
        reason: "PostgreSQL credit control regression.",
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error.message);
    const approved = await approveWorkspacePolicy(owner, {
      ...envelope("db-credit-policy-approve", "2026-07-01T00:00:00.000Z"),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: ["field://credit-limit/postgres"],
        reason: "Approve PostgreSQL credit control regression.",
      },
    });
    expect(approved.ok).toBe(true);
    return policyVersionId;
  }

  async function createSale() {
    const saleId = crypto.randomUUID();
    const draft = await createSaleDraft(owner, {
      ...envelope("db-credit-sale-draft"),
      payload: {
        saleId,
        customerId: ctx.customerId,
        currency: "VND",
        lines: [
          {
            lineId: crypto.randomUUID(),
            productId: ctx.productIds[0],
            productName: "Cà chua",
            qualityGradeId: ctx.qualityGradeId,
            qualityGradeName: "Loại 1",
            quantity: { valueScaled: 1_000, unit: "kg" },
            unitPrice: { amountMinor: 875_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error.message);
    return draft.value;
  }

  it("TC-CREDIT-003 — enforces the hard block in PostgreSQL and preserves lineage for an allowed sale", async () => {
    await installPolicy(875_000);
    const allowedDraft = await createSale();
    const allowed = await postSale(owner, {
      ...envelope("db-credit-sale-allowed"),
      expectedVersion: 1,
      payload: { saleId: allowedDraft.id },
    });
    expect(allowed.ok).toBe(true);
    if (!allowed.ok) return;
    expect(allowed.value.creditLimitPolicyVersionId).toBeTruthy();

    const blockedDraft = await createSale();
    const blocked = await postSale(owner, {
      ...envelope("db-credit-sale-blocked"),
      expectedVersion: 1,
      payload: { saleId: blockedDraft.id },
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe("CREDIT_LIMIT_EXCEEDED");

    const persistedBlocked = await getSale(owner, {
      workspaceId: ctx.workspaceId,
      saleId: blockedDraft.id,
    });
    expect(persistedBlocked.ok).toBe(true);
    if (persistedBlocked.ok) {
      expect(persistedBlocked.value.status).toBe("draft");
      expect(persistedBlocked.value.creditLimitPolicyVersionId).toBeNull();
    }
  });
});
