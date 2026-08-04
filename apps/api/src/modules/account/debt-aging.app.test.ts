import { describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  DUE_AT,
  SALE_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { getCustomerDebtAging } from "./account.queries.ts";
import { createWorkspacePolicyDraft, approveWorkspacePolicy } from "../policy/policy.handlers.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { voidSale } from "../sale/void-sale.handler.ts";
import { exportWorkspaceBackup } from "../operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../operations/restore-workspace.handler.ts";
import { workspaceIdSchema } from "@vuarau/domain-contracts";

function envelope(key: string, occurredAt = TRANSACTION_TIME) {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt,
  };
}

async function approvePolicy(
  harness: Harness,
  policyKind: "payment_terms_aging" | "payment_allocation",
  definition: Record<string, unknown>,
) {
  const draft = await createWorkspacePolicyDraft(harness.ctx, {
    ...envelope(`debt-policy-draft-${policyKind}`),
    payload: {
      policyVersionId: crypto.randomUUID(),
      policyKind,
      version: 1,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveTo: null,
      definition,
      evidenceReferences: [],
      reason: `Định nghĩa ${policyKind} cho test debt aging.`,
    },
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error(draft.error.message);

  const approved = await approveWorkspacePolicy(harness.ctx, {
    ...envelope(`debt-policy-approve-${policyKind}`),
    payload: {
      policyVersionId: draft.value.id,
      evidenceReferences: [`field://debt/${policyKind}/001`],
      reason: `Đã duyệt ${policyKind}.`,
    },
  });
  expect(approved.ok).toBe(true);
  if (!approved.ok) throw new Error(approved.error.message);
  return approved.value;
}

describe("UC-ACCOUNT-004 / BR-AGING-001 / TC-AGING-002", () => {
  it("returns unavailable instead of applying an implicit debt policy", async () => {
    const harness = createHarness();
    const result = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("unavailable");
      expect(result.value.diagnostics).toEqual([
        "no_effective_payment_terms_aging_policy",
        "no_effective_payment_allocation_policy",
      ]);
    }
  });

  it("reads policy-backed, workspace-scoped debt aging from the account ledger", async () => {
    const harness = createHarness();
    const termsPolicy = await approvePolicy(harness, "payment_terms_aging", {
      contractVersion: 1,
      parameters: {
        defaultTermDays: 7,
        defaultTermLabel: "7 ngày",
        customerTerms: [],
        graceDays: 0,
        agingBuckets: [{ code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 }],
        creditControl: "information_only",
      },
    });
    const allocationPolicy = await approvePolicy(harness, "payment_allocation", {
      contractVersion: 1,
      parameters: { strategy: "oldest_due_first" },
    });

    const created = await createSaleDraft(harness.ctx, {
      ...envelope("debt-sale-create"),
      payload: {
        saleId: SALE_ID,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        evidenceReferences: [],
        dueAt: DUE_AT,
        replacesSaleId: null,
      },
    });
    expect(created.ok).toBe(true);
    const posted = await postSale(harness.ctx, {
      ...envelope("debt-sale-post"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });
    expect(posted.ok).toBe(true);

    const result = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-01T00:00:00.000Z",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        status: "available",
        policyVersionId: termsPolicy.id,
        allocationPolicyVersionId: allocationPolicy.id,
        allocationStrategy: "oldest_due_first",
        integrity: "healthy",
      });
      expect(result.value.status === "available" && result.value.rows[0]).toMatchObject({
        saleId: SALE_ID,
        state: "overdue",
        outstandingAmount: { amountMinor: 875_000, currency: "VND" },
        daysOverdue: 2,
        termSource: "sale_override",
      });
    }
  });

  it("BR-AGING-005 / TC-AGING-005 — derives and persists the payment term from the effective policy at sale time", async () => {
    const harness = createHarness();
    const termsPolicy = await approvePolicy(harness, "payment_terms_aging", {
      contractVersion: 1,
      parameters: {
        defaultTermDays: 7,
        defaultTermLabel: "7 ngày",
        customerTerms: [],
        graceDays: 0,
        agingBuckets: [{ code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 }],
        creditControl: "information_only",
      },
    });
    await approvePolicy(harness, "payment_allocation", {
      contractVersion: 1,
      parameters: { strategy: "oldest_due_first" },
    });

    const created = await createSaleDraft(harness.ctx, {
      ...envelope("debt-derived-sale-create"),
      payload: {
        saleId: crypto.randomUUID(),
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        evidenceReferences: [],
        dueAt: null,
        replacesSaleId: null,
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const posted = await postSale(harness.ctx, {
      ...envelope("debt-derived-sale-post"),
      expectedVersion: 1,
      payload: { saleId: created.value.id },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;
    expect(posted.value).toMatchObject({
      dueAt: "2026-07-26T22:00:00.000Z",
      paymentTermsPolicyVersionId: termsPolicy.id,
      paymentTermsSource: "workspace_policy",
    });

    const result = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-01T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok && result.value.status === "available") {
      expect(result.value.rows[0]).toMatchObject({
        saleId: created.value.id,
        dueAt: "2026-07-26T22:00:00.000Z",
        termSource: "workspace_policy",
        termPolicyVersionId: termsPolicy.id,
      });
    }

    const backup = await exportWorkspaceBackup(harness.ctx, {
      ...envelope("debt-derived-sale-backup"),
      payload: {},
    });
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    expect(backup.value.payload.sales).toContainEqual(
      expect.objectContaining({
        id: created.value.id,
        paymentTermsPolicyVersionId: termsPolicy.id,
        paymentTermsSource: "workspace_policy",
      }),
    );

    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-0000000008b1");
    harness.db.registerWorkspace(target, "Vựa phục hồi debt terms");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const restored = await restoreWorkspaceBackup(harness.ctx, {
      ...envelope("debt-derived-sale-restore"),
      workspaceId: target,
      payload: { backup: backup.value, reason: "Kiểm tra phục hồi term lineage." },
    });
    expect(restored.ok).toBe(true);
    const restoredSale = await harness.deps.uow.transaction((repos) =>
      repos.saleReads.get(target, created.value.id),
    );
    expect(restoredSale).toMatchObject({
      paymentTermsPolicyVersionId: termsPolicy.id,
      paymentTermsSource: "workspace_policy",
      dueAt: "2026-07-26T22:00:00.000Z",
    });
  });

  it("BR-AGING-003 / TC-AGING-003 — keeps a future void in historical aging", async () => {
    const harness = createHarness();
    await approvePolicy(harness, "payment_terms_aging", {
      contractVersion: 1,
      parameters: {
        defaultTermDays: 7,
        defaultTermLabel: "7 ngày",
        customerTerms: [],
        graceDays: 0,
        agingBuckets: [{ code: "1-30", label: "1–30 ngày", minDaysOverdue: 1, maxDaysOverdue: 30 }],
        creditControl: "information_only",
      },
    });
    await approvePolicy(harness, "payment_allocation", {
      contractVersion: 1,
      parameters: { strategy: "oldest_due_first" },
    });

    const saleId = crypto.randomUUID();
    const created = await createSaleDraft(harness.ctx, {
      ...envelope("debt-as-of-sale-create"),
      payload: {
        saleId,
        customerId: CUSTOMER_ID,
        currency: "VND",
        lines: [...saleLineInputs],
        note: null,
        evidenceReferences: [],
        dueAt: "2026-07-21T00:00:00.000Z",
        replacesSaleId: null,
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const posted = await postSale(harness.ctx, {
      ...envelope("debt-as-of-sale-post"),
      expectedVersion: 1,
      payload: { saleId },
    });
    expect(posted.ok).toBe(true);
    if (!posted.ok) return;

    harness.clock.set("2026-08-05T00:00:00.000Z");
    const voided = await voidSale(harness.ctx, {
      ...envelope("debt-as-of-sale-void", "2026-08-05T00:00:00.000Z"),
      payload: {
        saleVoidId: crypto.randomUUID(),
        saleId,
        reasonCode: "wrong_amount",
        reason: "Void sau thời điểm kiểm tra lịch sử.",
      },
    });
    expect(voided.ok).toBe(true);

    const historical = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-01T00:00:00.000Z",
    });
    expect(historical.ok).toBe(true);
    if (historical.ok && historical.value.status === "available") {
      expect(historical.value.rows).toContainEqual(
        expect.objectContaining({
          saleId,
          outstandingAmount: { amountMinor: 875_000, currency: "VND" },
        }),
      );
      expect(historical.value.totals.ledgerBalance).toEqual({
        amountMinor: 875_000,
        currency: "VND",
      });
    }

    const current = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-06T00:00:00.000Z",
    });
    expect(current.ok).toBe(true);
    if (current.ok && current.value.status === "available") {
      expect(current.value.rows).not.toContainEqual(expect.objectContaining({ saleId }));
      expect(current.value.totals.ledgerBalance).toEqual({ amountMinor: 0, currency: "VND" });
    }
  });
});
