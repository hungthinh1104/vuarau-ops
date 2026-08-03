import { describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  DUE_AT,
  LATER_TRANSACTION_TIME,
  LATEST_TRANSACTION_TIME,
  PAYMENT_ID,
  SALE_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { workspaceIdSchema } from "@vuarau/domain-contracts";
import { createWorkspacePolicyDraft, approveWorkspacePolicy } from "../policy/policy.handlers.ts";
import { createSaleDraft } from "../sale/create-sale-draft.handler.ts";
import { postSale } from "../sale/post-sale.handler.ts";
import { recordCustomerPayment } from "../payment/record-payment.handler.ts";
import { getCustomerDebtAging } from "./account.queries.ts";
import { exportWorkspaceBackup } from "../operations/operations.queries.ts";
import { restoreWorkspaceBackup } from "../operations/restore-workspace.handler.ts";
import {
  recordPaymentAllocation,
  reversePaymentAllocation,
} from "./payment-allocation.handlers.ts";

function envelope(key: string, occurredAt = TRANSACTION_TIME) {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt,
  };
}

async function setupManualAllocation(harness: Harness) {
  for (const [policyKind, definition] of [
    [
      "payment_terms_aging",
      {
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
    ],
    ["payment_allocation", { contractVersion: 1, parameters: { strategy: "manual" } }],
  ] as const) {
    const draft = await createWorkspacePolicyDraft(harness.ctx, {
      ...envelope(`allocation-policy-${policyKind}-draft`),
      payload: {
        policyVersionId: crypto.randomUUID(),
        policyKind,
        version: 1,
        effectiveFrom: "2026-07-01T00:00:00.000Z",
        effectiveTo: null,
        definition,
        evidenceReferences: [],
        reason: `Policy ${policyKind} cho allocation test.`,
      },
    });
    expect(draft.ok).toBe(true);
    if (!draft.ok) throw new Error(draft.error.message);
    const approved = await approveWorkspacePolicy(harness.ctx, {
      ...envelope(`allocation-policy-${policyKind}-approve`),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: [`field://allocation/${policyKind}`],
        reason: `Duyệt ${policyKind}.`,
      },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) throw new Error(approved.error.message);
  }

  const draft = await createSaleDraft(harness.ctx, {
    ...envelope("allocation-sale-draft"),
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
  expect(draft.ok).toBe(true);
  const posted = await postSale(harness.ctx, {
    ...envelope("allocation-sale-post"),
    expectedVersion: 1,
    payload: { saleId: SALE_ID },
  });
  expect(posted.ok).toBe(true);
  const payment = await recordCustomerPayment(harness.ctx, {
    ...envelope("allocation-payment-record", LATER_TRANSACTION_TIME),
    payload: {
      paymentId: PAYMENT_ID,
      customerId: CUSTOMER_ID,
      amount: { amountMinor: 500_000, currency: "VND" },
      method: "cash",
      payerName: null,
      note: null,
      evidenceReferences: [],
    },
  });
  expect(payment.ok).toBe(true);
}

describe("UC-ACCOUNT-005 / BR-AGING-002 / TC-AGING-004", () => {
  it("records and compensates a manual allocation without changing the ledger", async () => {
    const harness = createHarness();
    await setupManualAllocation(harness);

    const allocation = await recordPaymentAllocation(harness.ctx, {
      ...envelope("allocation-record", LATER_TRANSACTION_TIME),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId: PAYMENT_ID,
        saleId: SALE_ID,
        amount: { amountMinor: 300_000, currency: "VND" },
        evidenceReferences: ["receipt://allocation/001"],
      },
    });
    expect(allocation.ok).toBe(true);
    if (!allocation.ok) return;

    const balance = await getCustomerDebtAging(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      customerId: CUSTOMER_ID,
      asOf: "2026-08-01T00:00:00.000Z",
    });
    expect(balance.ok).toBe(true);
    if (balance.ok && balance.value.status === "available") {
      expect(balance.value.rows[0]).toMatchObject({
        allocatedAmount: { amountMinor: 300_000, currency: "VND" },
        outstandingAmount: { amountMinor: 575_000, currency: "VND" },
      });
      expect(balance.value.payments[0]).toMatchObject({
        allocatedAmount: { amountMinor: 300_000, currency: "VND" },
        unallocatedAmount: { amountMinor: 200_000, currency: "VND" },
      });
    } else {
      expect(balance.ok && balance.value).toMatchObject({ status: "available" });
    }

    const reversal = await reversePaymentAllocation(harness.ctx, {
      ...envelope("allocation-reversal", LATEST_TRANSACTION_TIME),
      expectedVersion: 1,
      payload: {
        allocationId: allocation.value.id,
        reversalId: crypto.randomUUID(),
        amount: { amountMinor: 100_000, currency: "VND" },
        reason: "Đối chiếu lại phân bổ.",
        evidenceReferences: ["review://allocation/001"],
      },
    });
    expect(reversal.ok).toBe(true);
    expect(harness.db.accountEntries()).toHaveLength(2);
  });

  it("rejects an allocation that exceeds the payment remaining amount", async () => {
    const harness = createHarness();
    await setupManualAllocation(harness);
    // The policy is intentionally manual in setup; the domain command still
    // receives a stable refusal if a future handler is wired to an automatic one.
    const invalid = await recordPaymentAllocation(harness.ctx, {
      ...envelope("allocation-invalid", LATER_TRANSACTION_TIME),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId: PAYMENT_ID,
        saleId: SALE_ID,
        amount: { amountMinor: 600_000, currency: "VND" },
        evidenceReferences: [],
      },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("PAYMENT_ALLOCATION_EXCEEDS_PAYMENT");
  });

  it("exports and restores allocation facts with their compensation stream", async () => {
    const harness = createHarness();
    await setupManualAllocation(harness);
    const allocation = await recordPaymentAllocation(harness.ctx, {
      ...envelope("allocation-backup-record", LATER_TRANSACTION_TIME),
      expectedVersion: 1,
      payload: {
        allocationId: crypto.randomUUID(),
        paymentId: PAYMENT_ID,
        saleId: SALE_ID,
        amount: { amountMinor: 300_000, currency: "VND" },
        evidenceReferences: [],
      },
    });
    expect(allocation.ok).toBe(true);

    const backup = await exportWorkspaceBackup(harness.ctx, {
      ...envelope("allocation-backup-export", LATEST_TRANSACTION_TIME),
      payload: {},
    });
    expect(backup.ok).toBe(true);
    if (!backup.ok) return;
    expect(backup.value.payload.paymentAllocations).toHaveLength(1);
    expect(backup.value.payload.paymentAllocationReversals).toHaveLength(0);

    const target = workspaceIdSchema.parse("00000000-0000-4000-8000-0000000008a1");
    harness.db.registerWorkspace(target, "Vựa phục hồi allocation");
    harness.db.grantMembership(target, ACTOR_ID, "owner", true);
    const restored = await restoreWorkspaceBackup(harness.ctx, {
      ...envelope("allocation-backup-restore", LATEST_TRANSACTION_TIME),
      workspaceId: target,
      payload: { backup: backup.value, reason: "Kiểm tra phục hồi allocation." },
    });
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.value.restoredCounts["paymentAllocations"]).toBe(1);
  });
});
