import type {
  ApproveWorkspacePolicyCommand,
  CreateWorkspacePolicyDraftCommand,
  IsoInstant,
  RetireWorkspacePolicyCommand,
  WorkspacePolicyAvailability,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import { WORKSPACE_POLICY_KINDS } from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function validEffectiveRange(from: IsoInstant, to: IsoInstant | null): boolean {
  return to === null || Date.parse(to) > Date.parse(from);
}

function audit(
  policy: WorkspacePolicyDto,
  action: AuditDraft["action"],
  transactionTime: IsoInstant,
  recordedAt: IsoInstant,
  reason: string | null,
  before: Record<string, unknown> | null,
): AuditDraft {
  return {
    aggregateType: "workspace_policy",
    aggregateId: policy.id,
    action,
    transactionTime,
    recordedAt,
    before,
    after: {
      policyKind: policy.policyKind,
      version: policy.version,
      state: policy.state,
      effectiveFrom: policy.effectiveFrom,
      effectiveTo: policy.effectiveTo,
      evidenceReferenceCount: policy.evidenceReferences.length,
    },
    reason,
  };
}

export function decideCreateWorkspacePolicyDraft(
  command: CreateWorkspacePolicyDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<{ policy: WorkspacePolicyDto; audit: AuditDraft }> {
  if (!validEffectiveRange(command.payload.effectiveFrom, command.payload.effectiveTo)) {
    return err(
      "WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID",
      "A policy effective end must be later than its effective start.",
    );
  }
  const policy: WorkspacePolicyDto = {
    id: command.payload.policyVersionId,
    workspaceId: command.workspaceId,
    policyKind: command.payload.policyKind,
    version: command.payload.version,
    state: "draft",
    effectiveFrom: command.payload.effectiveFrom,
    effectiveTo: command.payload.effectiveTo,
    definition: command.payload.definition,
    evidenceReferences: [...command.payload.evidenceReferences],
    createdBy: command.actorId,
    createdAt: recordedAt,
    approvedBy: null,
    approvedAt: null,
    retiredBy: null,
    retiredAt: null,
    commandId: command.commandId,
    reason: command.payload.reason,
  };
  return ok({
    policy,
    audit: audit(
      policy,
      "workspace_policy.draft_created",
      command.occurredAt,
      recordedAt,
      policy.reason,
      null,
    ),
  });
}

export function decideApproveWorkspacePolicy(
  command: ApproveWorkspacePolicyCommand,
  current: WorkspacePolicyDto | null,
  recordedAt: IsoInstant,
): DomainResult<{ policy: WorkspacePolicyDto; audit: AuditDraft }> {
  if (current === null) return err("WORKSPACE_POLICY_NOT_FOUND", "Policy version was not found.");
  if (current.state !== "draft") {
    return err("WORKSPACE_POLICY_NOT_DRAFT", "Only a draft policy version can be approved.");
  }
  if (command.payload.evidenceReferences.length === 0) {
    return err(
      "WORKSPACE_POLICY_EVIDENCE_REQUIRED",
      "Policy approval requires supporting field evidence.",
    );
  }
  const evidenceReferences = [
    ...new Set([...current.evidenceReferences, ...command.payload.evidenceReferences]),
  ];
  const policy: WorkspacePolicyDto = {
    ...current,
    state: "approved",
    evidenceReferences,
    approvedBy: command.actorId,
    approvedAt: recordedAt,
    reason: command.payload.reason,
  };
  return ok({
    policy,
    audit: audit(
      policy,
      "workspace_policy.approved",
      command.occurredAt,
      recordedAt,
      command.payload.reason,
      { state: current.state, evidenceReferenceCount: current.evidenceReferences.length },
    ),
  });
}

export function decideRetireWorkspacePolicy(
  command: RetireWorkspacePolicyCommand,
  current: WorkspacePolicyDto | null,
  recordedAt: IsoInstant,
): DomainResult<{
  policy: WorkspacePolicyDto;
  audit: AuditDraft;
  expectedState: "draft" | "approved";
}> {
  if (current === null) return err("WORKSPACE_POLICY_NOT_FOUND", "Policy version was not found.");
  if (current.state === "retired") {
    return err("WORKSPACE_POLICY_NOT_APPROVED", "Policy version is already retired.");
  }
  const policy: WorkspacePolicyDto = {
    ...current,
    state: "retired",
    retiredBy: command.actorId,
    retiredAt: recordedAt,
    reason: command.payload.reason,
  };
  return ok({
    policy,
    expectedState: current.state,
    audit: audit(
      policy,
      "workspace_policy.retired",
      command.occurredAt,
      recordedAt,
      command.payload.reason,
      { state: current.state },
    ),
  });
}

export function resolveWorkspacePolicyAvailability(
  policies: readonly WorkspacePolicyDto[],
  asOf: IsoInstant,
): readonly WorkspacePolicyAvailability[] {
  return [...WORKSPACE_POLICY_KINDS].map((policyKind) => {
    const approvedVersions = policies
      .filter((policy) => policy.policyKind === policyKind && policy.state === "approved")
      .sort((left, right) => right.version - left.version);
    const effective = approvedVersions.filter(
      (policy) =>
        Date.parse(asOf) >= Date.parse(policy.effectiveFrom) &&
        (policy.effectiveTo === null || Date.parse(asOf) < Date.parse(policy.effectiveTo)),
    )[0];
    const latest = approvedVersions[0];
    if (effective === undefined) {
      if (latest === undefined) {
        return {
          policyKind,
          availability: "unavailable",
          reason: "no_approved_version",
          policyVersionId: null,
          version: null,
        } satisfies WorkspacePolicyAvailability;
      }
      if (Date.parse(asOf) < Date.parse(latest.effectiveFrom)) {
        return {
          policyKind,
          availability: "unavailable",
          reason: "effective_window_not_started",
          policyVersionId: latest.id,
          version: latest.version,
        } satisfies WorkspacePolicyAvailability;
      }
      return {
        policyKind,
        availability: "unavailable",
        reason: "effective_window_closed",
        policyVersionId: latest.id,
        version: latest.version,
      } satisfies WorkspacePolicyAvailability;
    }
    return {
      policyKind,
      availability: "available",
      reason: "approved",
      policyVersionId: effective.id,
      version: effective.version,
    } satisfies WorkspacePolicyAvailability;
  });
}
