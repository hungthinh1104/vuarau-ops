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
  createWorkspacePolicyDraft,
  approveWorkspacePolicy,
} from "../../../modules/policy/policy.handlers.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { getCustomerDebtAging } from "../../../modules/account/account.queries.ts";

describe.skipIf(skipWithoutDatabase())("debt aging against PostgreSQL", () => {
  let ctx: DbTestContext;
  let owner: CommandContext;
  let deps: CommandDeps;

  const envelope = (key: string, occurredAt = "2026-07-20T05:00:00.000Z") => ({
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: ctx.workspaceId,
    actorId: ctx.actorId,
    occurredAt,
  });

  beforeAll(async () => {
    ctx = await createDbTestContext("debt-aging");
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-04T00:00:00.000Z" },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterAll(async () => {
    await ctx?.close();
  });

  it("BR-AGING-003 / TC-AGING-003 — derives aging from real SQL sources", async () => {
    const policyEnvelope = (key: string) => envelope(key, "2026-07-01T00:00:00.000Z");
    const termsDraft = await createWorkspacePolicyDraft(owner, {
      ...policyEnvelope("db-aging-terms-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "payment_terms_aging",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: {
          contractVersion: 1,
          parameters: {
            defaultTermDays: 7,
            defaultTermLabel: "7 ngày",
            customerTerms: [],
            graceDays: 0,
            agingBuckets: [
              { code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 },
            ],
            creditControl: "information_only",
          },
        },
        evidenceReferences: [],
        reason: "DB debt aging terms.",
      },
    });
    expect(termsDraft.ok).toBe(true);
    if (!termsDraft.ok) return;
    const terms = await approveWorkspacePolicy(owner, {
      ...policyEnvelope("db-aging-terms-approve"),
      payload: {
        policyVersionId: termsDraft.value.id,
        evidenceReferences: ["field://debt/db-terms"],
        reason: "DB debt aging terms approved.",
      },
    });
    expect(terms.ok).toBe(true);
    if (!terms.ok) return;

    const allocationDraft = await createWorkspacePolicyDraft(owner, {
      ...policyEnvelope("db-aging-allocation-draft"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "payment_allocation",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: { contractVersion: 1, parameters: { strategy: "oldest_due_first" } },
        evidenceReferences: [],
        reason: "DB debt allocation.",
      },
    });
    expect(allocationDraft.ok).toBe(true);
    if (!allocationDraft.ok) return;
    const allocation = await approveWorkspacePolicy(owner, {
      ...policyEnvelope("db-aging-allocation-approve"),
      payload: {
        policyVersionId: allocationDraft.value.id,
        evidenceReferences: ["field://debt/db-allocation"],
        reason: "DB debt allocation approved.",
      },
    });
    expect(allocation.ok).toBe(true);
    if (!allocation.ok) return;

    const draft = await createSaleDraft(owner, {
      ...envelope("db-aging-sale-draft"),
      payload: {
        saleId: crypto.randomUUID(),
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
            unitPrice: { amountMinor: 100_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: "2026-07-25T05:00:00.000Z",
        replacesSaleId: null,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const posted = await postSale(owner, {
      ...envelope("db-aging-sale-post"),
      expectedVersion: 1,
      payload: { saleId: draft.value.id },
    });
    expect(posted.ok).toBe(true);

    const result = await getCustomerDebtAging(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      asOf: "2026-08-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("available");
      expect(result.value.status === "available" && result.value.rows[0]).toMatchObject({
        state: "overdue",
        outstandingAmount: { amountMinor: 100_000, currency: "VND" },
      });
    }
  });
});
