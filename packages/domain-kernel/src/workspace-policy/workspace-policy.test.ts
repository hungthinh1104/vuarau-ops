import { describe, expect, it } from "vitest";
import {
  approveWorkspacePolicyCommandSchema,
  actorIdSchema,
  commandIdSchema,
  createWorkspacePolicyDraftCommandSchema,
  paymentTermsAgingPolicyDefinitionSchema,
  retireWorkspacePolicyCommandSchema,
  WORKSPACE_POLICY_KINDS,
  workspaceIdSchema,
  workspacePolicyVersionIdSchema,
} from "@vuarau/domain-contracts";
import type { WorkspacePolicyDto } from "@vuarau/domain-contracts";
import {
  decideApproveWorkspacePolicy,
  decideCreateWorkspacePolicyDraft,
  decideRetireWorkspacePolicy,
  loadHistoricalPolicyLineage,
  resolvePolicyAsKnownAt,
  resolvePolicyForDecision,
  resolveWorkspacePolicyAvailability,
} from "./index.ts";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const ACTOR = "00000000-0000-4000-8000-000000000002";
const RECORDED_AT = "2026-08-03T10:00:00.000Z";
const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const PAYMENT_TERMS_DEFINITION = {
  contractVersion: 1 as const,
  parameters: {
    defaultTermDays: 7,
    defaultTermLabel: "7 ngày",
    customerTerms: [],
    graceDays: 0,
    agingBuckets: [
      { code: "current", label: "Chưa đến hạn", minDaysOverdue: 0, maxDaysOverdue: null },
    ],
    creditControl: "information_only" as const,
  },
};

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
      definition: PAYMENT_TERMS_DEFINITION,
      evidenceReferences: [],
      reason: "Ghi nhận bản nháp để review.",
    },
  });
}

function approvedPolicy(
  version: number,
  effectiveFrom: string,
  effectiveTo: string | null,
): WorkspacePolicyDto {
  return {
    id: workspacePolicyVersionIdSchema.parse(id(String(200 + version))),
    workspaceId: workspaceIdSchema.parse(WORKSPACE),
    policyKind: "payment_terms_aging",
    version,
    state: "approved",
    effectiveFrom,
    effectiveTo,
    definition: PAYMENT_TERMS_DEFINITION,
    evidenceReferences: ["field://policy/version-selection"],
    createdBy: actorIdSchema.parse(ACTOR),
    createdAt: RECORDED_AT,
    approvedBy: actorIdSchema.parse(ACTOR),
    approvedAt: "2026-07-31T10:00:00.000Z",
    retiredBy: null,
    retiredAt: null,
    commandId: commandIdSchema.parse(id(String(300 + version))),
    reason: "Đã được phê duyệt.",
  };
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
    expect(before).toHaveLength(WORKSPACE_POLICY_KINDS.length);
    expect(before.every((entry) => entry.availability === "unavailable")).toBe(true);
    expect(before.some((entry) => entry.policyKind === "management_intelligence")).toBe(true);
    expect(before.find((entry) => entry.policyKind === "payment_terms_aging")?.reason).toBe(
      "no_approved_version",
    );
  });

  it("TC-POLICY-010 selects the highest approved version that is effective at the requested time", () => {
    const current = approvedPolicy(1, "2026-08-01T00:00:00.000Z", null);
    const future = approvedPolicy(2, "2026-08-10T00:00:00.000Z", null);
    const expired = approvedPolicy(3, "2026-07-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z");

    const withFuture = resolveWorkspacePolicyAvailability(
      [current, future],
      "2026-08-03T00:00:00.000Z",
    );
    expect(withFuture.find((entry) => entry.policyKind === "payment_terms_aging")).toMatchObject({
      availability: "available",
      version: 1,
    });

    const withExpired = resolveWorkspacePolicyAvailability(
      [current, expired],
      "2026-08-03T00:00:00.000Z",
    );
    expect(withExpired.find((entry) => entry.policyKind === "payment_terms_aging")).toMatchObject({
      availability: "available",
      version: 1,
    });
  });

  it("TC-POLICY-011 preserves historical availability after retirement and approval timing", () => {
    const approved = approvedPolicy(1, "2026-08-01T00:00:00.000Z", null);
    const retired = {
      ...approved,
      state: "retired" as const,
      retiredBy: actorIdSchema.parse(ACTOR),
      retiredAt: "2026-08-05T00:00:00.000Z",
    };

    expect(
      resolvePolicyAsKnownAt(
        [retired],
        "payment_terms_aging",
        "2026-08-04T00:00:00.000Z",
        "2026-08-04T00:00:00.000Z",
      ),
    ).toEqual(retired);
    expect(
      resolvePolicyAsKnownAt(
        [retired],
        "payment_terms_aging",
        "2026-08-05T00:00:00.000Z",
        "2026-08-05T00:00:00.000Z",
      ),
    ).toEqual(retired);
    expect(
      resolvePolicyForDecision(
        [retired],
        "payment_terms_aging",
        "2026-08-05T00:00:00.000Z",
        "2026-08-05T00:00:00.000Z",
      ),
    ).toBeNull();

    const beforeApproval = { ...approved, approvedAt: "2026-08-04T00:00:00.000Z" };
    expect(
      resolvePolicyAsKnownAt(
        [beforeApproval],
        "payment_terms_aging",
        "2026-08-03T00:00:00.000Z",
        "2026-08-03T00:00:00.000Z",
      ),
    ).toBeNull();
  });

  it("TC-POLICY-012 rejects overlapping approved effective windows", () => {
    const draft = decideCreateWorkspacePolicyDraft(
      createWorkspacePolicyDraftCommandSchema.parse({
        ...createCommand(),
        payload: {
          ...createCommand().payload,
          policyVersionId: id("111"),
          version: 2,
          effectiveFrom: "2026-08-05T00:00:00.000Z",
        },
      }),
      RECORDED_AT,
    );
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;

    const approval = decideApproveWorkspacePolicy(
      approveWorkspacePolicyCommandSchema.parse({
        commandId: id("112"),
        idempotencyKey: "policy-approve-overlap-001",
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        occurredAt: RECORDED_AT,
        payload: {
          policyVersionId: draft.value.policy.id,
          evidenceReferences: ["field://review/payment-terms-overlap-001"],
          reason: "Không cho phép hai version active cùng thời điểm.",
        },
      }),
      draft.value.policy,
      RECORDED_AT,
      [approvedPolicy(1, "2026-08-01T00:00:00.000Z", null)],
    );
    expect(approval.ok).toBe(false);
    if (!approval.ok) expect(approval.error.code).toBe("WORKSPACE_POLICY_EFFECTIVE_OVERLAP");
  });

  it("TC-POLICY-016 rejects policy kinds without a typed definition contract", () => {
    for (const policyKind of ["receivable_payable_recognition", "return_claim_credit"] as const) {
      const command = createWorkspacePolicyDraftCommandSchema.safeParse({
        ...createCommand(),
        payload: { ...createCommand().payload, policyKind },
      });
      expect(command.success).toBe(false);
    }
  });

  it("TC-POLICY-017 rejects a malformed legacy draft again during approval", () => {
    const draft = decideCreateWorkspacePolicyDraft(createCommand(), RECORDED_AT);
    expect(draft.ok).toBe(true);
    if (!draft.ok) return;
    const malformed = {
      ...draft.value.policy,
      definition: { contractVersion: 99, parameters: { unexpected: true } },
    } as unknown as WorkspacePolicyDto;
    const approval = decideApproveWorkspacePolicy(
      approveWorkspacePolicyCommandSchema.parse({
        commandId: id("118"),
        idempotencyKey: "policy-approve-malformed-001",
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        occurredAt: RECORDED_AT,
        payload: {
          policyVersionId: malformed.id,
          evidenceReferences: ["field://review/malformed-policy"],
          reason: "Không duyệt dữ liệu legacy hỏng.",
        },
      }),
      malformed,
      RECORDED_AT,
    );
    expect(approval.ok).toBe(false);
    if (!approval.ok) expect(approval.error.code).toBe("WORKSPACE_POLICY_DEFINITION_INVALID");
  });

  it("TC-POLICY-018 fails closed when backdated policy versions overlap in business time", () => {
    const retired = {
      ...approvedPolicy(1, "2026-08-01T00:00:00.000Z", null),
      state: "retired" as const,
      retiredBy: actorIdSchema.parse(ACTOR),
      retiredAt: "2026-08-05T00:00:00.000Z",
    };
    const backdated = {
      ...approvedPolicy(2, "2026-08-01T00:00:00.000Z", null),
      approvedAt: "2026-08-05T00:00:00.000Z",
    };
    expect(
      resolvePolicyAsKnownAt(
        [retired, backdated],
        "payment_terms_aging",
        "2026-08-02T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
      ),
    ).toBeNull();
    expect(
      resolveWorkspacePolicyAvailability(
        [retired, backdated],
        "2026-08-02T00:00:00.000Z",
        "2026-08-06T00:00:00.000Z",
      ).find((entry) => entry.policyKind === "payment_terms_aging"),
    ).toMatchObject({ availability: "unavailable", reason: "corrupt_overlap" });
  });

  it("TC-POLICY-019 loads retired policy lineage for historical correction", () => {
    const retired = {
      ...approvedPolicy(1, "2026-08-01T00:00:00.000Z", null),
      state: "retired" as const,
      retiredBy: actorIdSchema.parse(ACTOR),
      retiredAt: "2026-08-05T00:00:00.000Z",
    };
    expect(loadHistoricalPolicyLineage([retired], retired.id)).toEqual(retired);
  });

  it("TC-POLICY-020 rejects ambiguous payment-term and aging definitions", () => {
    const invalid = paymentTermsAgingPolicyDefinitionSchema.safeParse({
      contractVersion: 1,
      parameters: {
        defaultTermDays: 7,
        defaultTermLabel: "7 ngày",
        customerTerms: [
          { customerId: WORKSPACE, label: "7 ngày", termDays: 7 },
          { customerId: WORKSPACE, label: "14 ngày", termDays: 14 },
        ],
        graceDays: 0,
        agingBuckets: [
          { code: "1-7", label: "1–7", minDaysOverdue: 1, maxDaysOverdue: 7 },
          { code: "1-7", label: "trùng", minDaysOverdue: 9, maxDaysOverdue: null },
        ],
        creditControl: "warning",
      },
    });
    expect(invalid.success).toBe(false);
  });
});
