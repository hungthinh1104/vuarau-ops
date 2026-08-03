import { beforeEach, describe, expect, it } from "vitest";
import {
  ACTOR_ID,
  FOREIGN_ACTOR_ID,
  OTHER_WORKSPACE_ID,
  TRANSACTION_TIME,
  WORKSPACE_ID,
} from "@vuarau/test-fixtures";
import { createHarness, type Harness } from "../../testing/command-test-harness.ts";
import {
  approveWorkspacePolicy,
  createWorkspacePolicyDraft,
  retireWorkspacePolicy,
} from "./policy.handlers.ts";
import {
  getWorkspacePolicy,
  getWorkspacePolicyAvailability,
  listWorkspacePolicies,
} from "./policy.queries.ts";

let harness: Harness;

beforeEach(() => {
  harness = createHarness();
});

const envelope = (key: string, actorId = ACTOR_ID, workspaceId = WORKSPACE_ID) => ({
  commandId: crypto.randomUUID(),
  idempotencyKey: key,
  workspaceId,
  actorId,
  occurredAt: TRANSACTION_TIME,
});

const draftInput = (key: string) => {
  const policyVersionId = crypto.randomUUID();
  return {
    ...envelope(key),
    payload: {
      policyVersionId,
      policyKind: "payment_terms_aging" as const,
      version: 1,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: null,
      definition: {
        contractVersion: 1,
        parameters: {
          defaultTermDays: 7,
          defaultTermLabel: "7 ngày",
          customerTerms: [],
          graceDays: 0,
          agingBuckets: [
            { code: "current", label: "Chưa đến hạn", minDaysOverdue: 0, maxDaysOverdue: null },
          ],
          creditControl: "information_only",
        },
      },
      evidenceReferences: [],
      reason: "Bản nháp chờ chủ vựa duyệt.",
    },
  };
};

describe("workspace policy registry", () => {
  it("TC-POLICY-003 records a draft, keeps all capabilities unavailable, and safely replays it", async () => {
    const command = draftInput("policy-draft-retry-001");
    const first = await createWorkspacePolicyDraft(harness.ctx, command);
    const retry = await createWorkspacePolicyDraft(harness.ctx, command);
    expect(first.ok).toBe(true);
    expect(retry).toEqual(first);
    expect(harness.db.auditRecords()).toHaveLength(1);

    const listed = await listWorkspacePolicies(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      policyKind: null,
      state: null,
      cursor: null,
      limit: 20,
    });
    expect(listed.ok).toBe(true);
    if (listed.ok) expect(listed.value.items).toHaveLength(1);

    const availability = await getWorkspacePolicyAvailability(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: TRANSACTION_TIME,
    });
    expect(availability.ok).toBe(true);
    if (availability.ok) {
      expect(availability.value).toHaveLength(13);
      expect(availability.value.every((entry) => entry.availability === "unavailable")).toBe(true);
    }
  });

  it("TC-POLICY-006 requires evidence to approve, exposes an effective approved version, and supports retirement", async () => {
    const draft = await createWorkspacePolicyDraft(harness.ctx, draftInput("policy-flow-001"));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const missingEvidence = await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve-missing-evidence-001"),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: [],
        reason: "Chưa có evidence để duyệt.",
      },
    });
    expect(missingEvidence.ok).toBe(false);
    if (!missingEvidence.ok) expect(missingEvidence.error.code).toBe("INVALID_COMMAND_PAYLOAD");

    const approved = await approveWorkspacePolicy(harness.ctx, {
      ...envelope("policy-approve-001"),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: ["field://policy/payment-terms-001"],
        reason: "Đã đối chiếu với chủ vựa.",
      },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.state).toBe("approved");
    expect(approved.value.approvedBy).toBe(ACTOR_ID);

    const availability = await getWorkspacePolicyAvailability(harness.ctx, {
      workspaceId: WORKSPACE_ID,
      asOf: "2026-08-03T00:00:00.000Z",
    });
    expect(availability.ok).toBe(true);
    if (availability.ok) {
      expect(
        availability.value.find((entry) => entry.policyKind === "payment_terms_aging"),
      ).toMatchObject({
        availability: "available",
        version: 1,
      });
    }

    const retired = await retireWorkspacePolicy(harness.ctx, {
      ...envelope("policy-retire-001"),
      payload: { policyVersionId: approved.value.id, reason: "Thay bằng bản policy mới." },
    });
    expect(retired.ok).toBe(true);
    if (retired.ok) expect(retired.value.state).toBe("retired");
  });

  it("TC-POLICY-007 keeps policy reads and writes workspace-scoped", async () => {
    const draft = await createWorkspacePolicyDraft(harness.ctx, draftInput("policy-isolation-001"));
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const foreignRead = await getWorkspacePolicy(harness.contextFor(FOREIGN_ACTOR_ID), {
      workspaceId: OTHER_WORKSPACE_ID,
      policyVersionId: draft.value.id,
    });
    expect(foreignRead.ok).toBe(false);
    if (!foreignRead.ok) expect(foreignRead.error.code).toBe("WORKSPACE_POLICY_NOT_FOUND");

    const foreignApprove = await approveWorkspacePolicy(harness.contextFor(FOREIGN_ACTOR_ID), {
      ...envelope("policy-foreign-approve-001", FOREIGN_ACTOR_ID, OTHER_WORKSPACE_ID),
      payload: {
        policyVersionId: draft.value.id,
        evidenceReferences: ["field://policy/foreign-001"],
        reason: "Không được duyệt policy của workspace khác.",
      },
    });
    expect(foreignApprove.ok).toBe(false);
    if (!foreignApprove.ok) expect(foreignApprove.error.code).toBe("WORKSPACE_POLICY_NOT_FOUND");
  });
});
