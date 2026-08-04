import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import { getCustomerDebtAging } from "../../../modules/account/account.queries.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { recordPaymentAllocation } from "../../../modules/account/payment-allocation.handlers.ts";

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

  beforeEach(async () => {
    ctx = await createDbTestContext(`debt-aging-${crypto.randomUUID()}`);
    deps = {
      uow: createUnitOfWork(ctx.database.db, randomIdGenerator) as CommandDeps["uow"],
      clock: { now: () => "2026-08-04T00:00:00.000Z" },
    };
    owner = { deps, principal: { actorId: ctx.actorId, subject: ctx.subject } };
  });

  afterEach(async () => {
    await ctx?.close();
  });

  it("BR-AGING-003 / BR-AGING-005 / TC-AGING-003 — derives aging and term lineage from real SQL sources", async () => {
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
        definition: { contractVersion: 1, parameters: { strategy: "manual" } },
        evidenceReferences: [],
        reason: "DB debt allocation.",
      },
    });
    expect(allocationDraft.ok).toBe(true);
    if (!allocationDraft.ok) return;
    const allocationPolicy = await approveWorkspacePolicy(owner, {
      ...policyEnvelope("db-aging-allocation-approve"),
      payload: {
        policyVersionId: allocationDraft.value.id,
        evidenceReferences: ["field://debt/db-allocation"],
        reason: "DB debt allocation approved.",
      },
    });
    expect(allocationPolicy.ok).toBe(true);
    if (!allocationPolicy.ok) return;

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
        dueAt: null,
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

    const paymentId = crypto.randomUUID();
    const payment = await recordCustomerPayment(owner, {
      ...envelope("db-aging-payment-record", "2026-07-30T05:00:00.000Z"),
      payload: {
        paymentId,
        customerId: ctx.customerId,
        amount: { amountMinor: 50_000, currency: "VND" },
        method: "cash",
        payerName: null,
        note: null,
        evidenceReferences: [],
      },
    });
    expect(payment.ok).toBe(true);
    const allocation = await recordPaymentAllocation(owner, {
      ...envelope("db-aging-payment-allocation", "2026-07-31T05:00:00.000Z"),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId,
        saleId: draft.value.id,
        amount: { amountMinor: 50_000, currency: "VND" },
        evidenceReferences: ["field://debt/db-allocation-record"],
      },
    });
    expect(allocation.ok).toBe(true);

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
        dueAt: "2026-07-27T05:00:00.000Z",
        termSource: "workspace_policy",
        termPolicyVersionId: terms.value.id,
        allocatedAmount: { amountMinor: 50_000, currency: "VND" },
        outstandingAmount: { amountMinor: 50_000, currency: "VND" },
      });
    }
  });

  it("BR-AGING-003 / TC-AGING-003 — filters a sale void by its business time", async () => {
    const termsDraft = await createWorkspacePolicyDraft(owner, {
      ...envelope("db-aging-as-of-terms-draft", "2026-07-01T00:00:00.000Z"),
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
        reason: "DB historical debt terms.",
      },
    });
    expect(termsDraft.ok).toBe(true);
    if (!termsDraft.ok) return;
    const terms = await approveWorkspacePolicy(owner, {
      ...envelope("db-aging-as-of-terms-approve", "2026-07-01T00:00:00.000Z"),
      payload: {
        policyVersionId: termsDraft.value.id,
        evidenceReferences: ["field://debt/db-as-of-terms"],
        reason: "DB historical debt terms approved.",
      },
    });
    expect(terms.ok).toBe(true);
    if (!terms.ok) return;

    const allocationDraft = await createWorkspacePolicyDraft(owner, {
      ...envelope("db-aging-as-of-allocation-draft", "2026-07-01T00:00:00.000Z"),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind: "payment_allocation",
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition: { contractVersion: 1, parameters: { strategy: "oldest_due_first" } },
        evidenceReferences: [],
        reason: "DB historical debt allocation.",
      },
    });
    expect(allocationDraft.ok).toBe(true);
    if (!allocationDraft.ok) return;
    const allocation = await approveWorkspacePolicy(owner, {
      ...envelope("db-aging-as-of-allocation-approve", "2026-07-01T00:00:00.000Z"),
      payload: {
        policyVersionId: allocationDraft.value.id,
        evidenceReferences: ["field://debt/db-as-of-allocation"],
        reason: "DB historical debt allocation approved.",
      },
    });
    expect(allocation.ok).toBe(true);
    if (!allocation.ok) return;

    const saleId = crypto.randomUUID();
    const draft = await createSaleDraft(owner, {
      ...envelope("db-aging-as-of-sale-draft"),
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
            unitPrice: { amountMinor: 100_000, currency: "VND" },
          },
        ],
        note: null,
        evidenceReferences: [],
        dueAt: "2026-07-21T00:00:00.000Z",
        replacesSaleId: null,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const posted = await postSale(owner, {
      ...envelope("db-aging-as-of-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;

    const voided = await voidSale(owner, {
      ...envelope("db-aging-as-of-sale-void", "2026-08-03T00:00:00.000Z"),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId,
        reasonCode: "wrong_amount",
        reason: "DB void after historical cutoff.",
      },
    });
    expect(voided.ok).toBe(true);

    const historical = await getCustomerDebtAging(owner, {
      workspaceId: ctx.workspaceId,
      customerId: ctx.customerId,
      asOf: "2026-08-01T00:00:00.000Z",
    });
    expect(historical.ok).toBe(true);
    if (historical.ok && historical.value.status === "available") {
      expect(historical.value.rows).toContainEqual(
        expect.objectContaining({
          saleId,
          outstandingAmount: { amountMinor: 100_000, currency: "VND" },
        }),
      );
    }
  });
});
