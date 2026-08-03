import { describe, expect, it } from "vitest";
import {
  approveWorkspacePolicyCommandSchema,
  createWorkspacePolicyDraftCommandSchema,
  retireWorkspacePolicyCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideApproveWorkspacePolicy,
  decideCreateWorkspacePolicyDraft,
  decideRetireWorkspacePolicy,
  resolveWorkspacePolicyAvailability,
} from "./index.ts";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002";
const RECORDED_AT = "2026-08-03T10:00:00.000Z";
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

function createCommand() {
  return createWorkspacePolicyDraftCommandSchema.parse({
    commandId: id("100"),
    idempotencyKey: "policy-draft-001",
    workspaceId: WORKSPACE,
    actorId: ACTOR,
    occurredAt: RECORDED_AT,
    payload: {
      policyVersionId: id("101"),
      policyKind: "payment_terms_aging",
      version: 1,
      effectiveFrom: "2026-08-01T00:00:00.000Z",
      effectiveTo: null,
      definition: { contractVersion: 1, parameters: { source: "field-review" } },
      evidenceReferences: [],
      reason: "Ghi nhận bản nháp để review.",
    },
  });
}

describe("workspace policy registry", () => {
  it("TC-POLICY-001 keeps a policy draft inactive until approval evidence exists", () => {
    const draft = decideCreateWorkspacePolicyDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    expect(draft.value.policy.state).toBe("draft");
    expect(draft.value.policy.approvedBy).toBeNull();

    const approval = decideApproveWorkspacePolicy(
      approveWorkspacePolicyCommandSchema.parse({
        commandId: id("102"),
        idempotencyKey: "policy-approve-001",
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        occurredAt: RECORDED_AT,
        payload: {
          policyVersionId: draft.value.policy.id,
          evidenceReferences: ["field://review/payment-terms-001"],
          reason: "Chủ vựa duyệt sau khi xem evidence.",
        },
      }),
      draft.value.policy,
      "2026-08-03T10:01:00.000Z",
    );
    expect(approval.ok).toBe(true);
    if (approval.ok) {
      expect(approval.value.policy.state).toBe("approved");
      expect(approval.value.policy.approvedBy).toBe(ACTOR);
      expect(approval.value.policy.evidenceReferences).toContain(
        "field://review/payment-terms-001",
      );
    }
  });

  it("TC-POLICY-002 rejects invalid effective ranges and cannot approve a retired version", () => {
    const invalid = decideCreateWorkspacePolicyDraft(
      createWorkspacePolicyDraftCommandSchema.parse({
        ...createCommand(),
        payload: { ...createCommand().payload, effectiveTo: "2026-07-31T00:00:00.000Z" },
      }),
      RECORDED_AT,
    );
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe("WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID");

    const draft = decideCreateWorkspacePolicyDraft(createCommand(), RECORDED_AT);
    if (!draft.ok) return;
    const retired = decideRetireWorkspacePolicy(
      retireWorkspacePolicyCommandSchema.parse({
        commandId: id("103"),
        idempotencyKey: "policy-retire-001",
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        occurredAt: RECORDED_AT,
        payload: { policyVersionId: draft.value.policy.id, reason: "Huỷ bản nháp." },
      }),
      draft.value.policy,
      RECORDED_AT,
    );
    expect(retired.ok).toBe(true);
    if (!retired.ok) return;
    expect(retired.value.policy.state).toBe("retired");
    const approval = decideApproveWorkspacePolicy(
      approveWorkspacePolicyCommandSchema.parse({
        commandId: id("104"),
        idempotencyKey: "policy-approve-002",
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        occurredAt: RECORDED_AT,
        payload: {
          policyVersionId: draft.value.policy.id,
          evidenceReferences: ["field://review/payment-terms-002"],
          reason: "Không được duyệt bản đã huỷ.",
        },
      }),
      retired.value.policy,
      RECORDED_AT,
    );
    expect(approval.ok).toBe(false);
    if (!approval.ok) expect(approval.error.code).toBe("WORKSPACE_POLICY_NOT_DRAFT");
  });

  it("TC-POLICY-008 returns every policy capability as unavailable until an approved effective version exists", () => {
    const draft = decideCreateWorkspacePolicyDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const before = resolveWorkspacePolicyAvailability([draft.value.policy], RECORDED_AT);
    expect(before).toHaveLength(12);
    expect(before.every((entry) => entry.availability === "unavailable")).toBe(true);
    expect(before.find((entry) => entry.policyKind === "payment_terms_aging")?.reason).toBe(
      "no_approved_version",
    );
  });
});
