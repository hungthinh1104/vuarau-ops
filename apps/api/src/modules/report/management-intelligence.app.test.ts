import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspacePolicyVersionId } from "@vuarau/domain-contracts";
import { OTHER_WORKSPACE_ID, TRANSACTION_TIME, WORKSPACE_ID } from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import { approveWorkspacePolicy, createWorkspacePolicyDraft } from "../policy/policy.handlers.ts";
import { getManagementIntelligence } from "./management-intelligence.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (key: string, workspaceId = WORKSPACE_ID) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId,
  actorId: harness.ctx.principal.actorId,
  occurredAt: TRANSACTION_TIME,
});

async function approveManagementIntelligencePolicy() {
  const policyVersionId = crypto.randomUUID() as WorkspacePolicyVersionId;
  const draft = await createWorkspacePolicyDraft(harness.ctx, {
    ...envelope("management-intelligence-policy-draft"),
    payload: {
      policyVersionId,
      policyKind: "management_intelligence",
      version: 1,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: null,
      definition: {
        contractVersion: 1,
        parameters: {
          strategy: "operational_report_snapshot",
          reportTypes: ["cash_balances", "inventory_by_product_unit"],
        },
      },
      evidenceReferences: [],
      reason: "Chỉ đọc các tổng số report nguồn đã có.",
    },
  });
  expect(draft.ok).toBe(true);
  if (!draft.ok) throw new Error(draft.error.message);

  const approved = await approveWorkspacePolicy(harness.ctx, {
    ...envelope("management-intelligence-policy-approve"),
    payload: {
      policyVersionId,
      evidenceReferences: ["field://management-intelligence/001"],
      reason: "Đã duyệt nguồn và cách hiển thị snapshot.",
    },
  });
  expect(approved.ok).toBe(true);
  if (!approved.ok) throw new Error(approved.error.message);
  return policyVersionId;
}

describe("management intelligence application read", () => {
  it("is unavailable without policy and exposes only selected source reports after approval", async () => {
    const beforePolicy = await getManagementIntelligence(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: "2026-08-04T09:00:00.000Z",
      businessDate: null,
    });
    expect(beforePolicy).toMatchObject({
      ok: true,
      value: {
        status: "unavailable",
        diagnostics: ["no_effective_management_intelligence_policy"],
        indicators: [],
      },
    });

    const policyVersionId = await approveManagementIntelligencePolicy();
    const result = await getManagementIntelligence(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: "2026-08-04T09:00:00.000Z",
      businessDate: null,
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        status: "available",
        policyVersionId,
        sourceReportTypes: ["cash_balances", "inventory_by_product_unit"],
      },
    });
    if (result.ok) {
      expect(result.value.indicators).toHaveLength(2);
      expect(result.value).not.toHaveProperty("score");
      expect(result.value).not.toHaveProperty("recommendation");
    }
  });

  it("does not cross workspace authorization boundaries", async () => {
    const result = await getManagementIntelligence(harness.ctx, {
      workspaceId: OTHER_WORKSPACE_ID,
      asOf: "2026-08-04T09:00:00.000Z",
      businessDate: null,
    });

    expect(result).toMatchObject({ ok: false, error: { code: "WORKSPACE_ACCESS_DENIED" } });
  });
});
