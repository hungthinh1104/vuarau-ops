import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  CUSTOMER_ID,
  SALE_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
  saleLineInputs,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { createSaleDraft } from "./create-sale-draft.handler.ts";
import { postSale } from "./post-sale.handler.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

function envelope(key: string) {
  return {
    commandId: crypto.randomUUID(),
    idempotencyKey: key,
    workspaceId: WORKSPACE_ID,
    actorId: ACTOR_ID,
    occurredAt: TRANSACTION_TIME,
  };
}

async function installCreditPolicy(
  mode: "information_only" | "warning" | "approval_required" | "hard_block",
  limit: number | null,
) {
  const policyVersionId = crypto.randomUUID();
  const draft = await createWorkspacePolicyDraft(harness.ctx, {
    ...envelope(`credit-draft-${policyVersionId}`),
    payload: {
      policyVersionId,
      policyKind: "credit_limit",
      version: 1,
      effectiveFrom: "2026-07-01T00:00:00.000Z",
      effectiveTo: null,
      definition: {
        contractVersion: 1,
        parameters: {
          mode,
          limit: limit === null ? null : { amountMinor: limit, currency: "VND" },
        },
      },
      evidenceReferences: [],
      reason: "Credit control regression policy.",
    },
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error(draft.error.message);

  const approved = await approveWorkspacePolicy(harness.ctx, {
    ...envelope(`credit-approve-${policyVersionId}`),
    payload: {
      policyVersionId: draft.value.id,
      evidenceReferences: ["field://credit-limit/regression"],
      reason: "Approve credit control regression policy.",
    },
  });
  expect(approved.ok).toBe(true);
  return policyVersionId;
}

async function createDraft() {
  const draft = await createSaleDraft(harness.ctx, {
    ...envelope("credit-sale-draft"),
    payload: {
      saleId: SALE_ID,
      customerId: CUSTOMER_ID,
      currency: "VND",
      lines: [...saleLineInputs],
      note: null,
      evidenceReferences: [],
      dueAt: null,
      replacesSaleId: null,
    },
  });
  expect(draft.ok).toBe(true);
}

describe("UC-SALE-002 / BR-CREDIT-001 / TC-CREDIT-002", () => {
  it("blocks an over-limit sale before posting or writing ledger effects", async () => {
    await installCreditPolicy("hard_block", 800_000);
    await createDraft();

    const result = await postSale(harness.ctx, {
      ...envelope("credit-sale-post"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CREDIT_LIMIT_EXCEEDED");
    expect(harness.db.accountEntries()).toHaveLength(0);
    expect(harness.db.balanceFor(WORKSPACE_ID, CUSTOMER_ID)).toBeNull();
  });

  it("records the effective credit policy lineage on an allowed sale", async () => {
    const policyVersionId = await installCreditPolicy("hard_block", 875_000);
    await createDraft();

    const result = await postSale(harness.ctx, {
      ...envelope("credit-sale-post"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.creditLimitPolicyVersionId).toBe(policyVersionId);
    expect(harness.db.accountEntries()).toHaveLength(1);
  });

  it("fails closed when the effective policy asks for approval without an approval command", async () => {
    await installCreditPolicy("approval_required", 875_000);
    await createDraft();

    const result = await postSale(harness.ctx, {
      ...envelope("credit-sale-post"),
      expectedVersion: 1,
      payload: { saleId: SALE_ID },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CREDIT_POLICY_UNAVAILABLE");
    expect(harness.db.accountEntries()).toHaveLength(0);
  });
});
