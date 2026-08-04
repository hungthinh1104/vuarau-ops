import type {
  ApproveWorkspacePolicyCommand,
  CreateWorkspacePolicyDraftCommand,
  IsoInstant,
  RetireWorkspacePolicyCommand,
  WorkspacePolicyAvailability,
  WorkspacePolicyDto,
} from "@vuarau/domain-contracts";
import {
  WORKSPACE_POLICY_KINDS,
  parseWorkspacePolicyDto,
  policyDefinitionSchemas,
  validatePolicyDefinition,
} from "@vuarau/domain-contracts";
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
  const definition = validatePolicyDefinition(
    command.payload.policyKind,
    command.payload.definition,
  );
  if (!definition.success) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "The policy definition is not a supported typed contract.",
      { policyKind: command.payload.policyKind },
    );
  }
  const policy = parseWorkspacePolicyDto({
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
  });
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

function isApprovedAt(policy: WorkspacePolicyDto, knowledgeAt: IsoInstant): boolean {
  return policy.approvedAt !== null && Date.parse(policy.approvedAt) <= Date.parse(knowledgeAt);
}

function isEffectiveForBusinessTime(policy: WorkspacePolicyDto, businessAt: IsoInstant): boolean {
  const time = Date.parse(businessAt);
  return (
    time >= Date.parse(policy.effectiveFrom) &&
    (policy.effectiveTo === null || time < Date.parse(policy.effectiveTo))
  );
}

function isValidPolicyDefinition(policy: WorkspacePolicyDto): boolean {
  return validatePolicyDefinition(policy.policyKind, policy.definition).success;
}

function isEffectiveForDecision(
  policy: WorkspacePolicyDto,
  businessAt: IsoInstant,
  decisionAt: IsoInstant,
): boolean {
  return (
    (policy.state === "approved" || policy.state === "retired") &&
    isApprovedAt(policy, decisionAt) &&
    isEffectiveForBusinessTime(policy, businessAt) &&
    (policy.retiredAt === null || Date.parse(decisionAt) < Date.parse(policy.retiredAt))
  );
}

function activeBusinessInterval(policy: WorkspacePolicyDto): { start: number; end: number } | null {
  if (policy.approvedAt === null) return null;
  const start = Date.parse(policy.effectiveFrom);
  const end =
    policy.effectiveTo === null ? Number.POSITIVE_INFINITY : Date.parse(policy.effectiveTo);
  return end <= start ? null : { start, end };
}

/** Returns whether an approved version would overlap another active version. */
export function hasOverlappingWorkspacePolicyEffectiveWindow(
  candidate: WorkspacePolicyDto,
  existingPolicies: readonly WorkspacePolicyDto[],
): boolean {
  const candidateInterval = activeBusinessInterval(candidate);
  if (candidateInterval === null) return false;
  return existingPolicies.some((existing) => {
    if (existing.id === candidate.id || existing.policyKind !== candidate.policyKind) return false;
    const existingInterval = activeBusinessInterval(existing);
    return (
      existingInterval !== null &&
      candidateInterval.start < existingInterval.end &&
      existingInterval.start < candidateInterval.end
    );
  });
}

/** Resolves a policy usable by a new decision at a business and system time. */
export function resolvePolicyForDecision(
  policies: readonly WorkspacePolicyDto[],
  policyKind: WorkspacePolicyDto["policyKind"],
  businessAt: IsoInstant,
  decisionAt: IsoInstant,
): WorkspacePolicyDto | null {
  const candidates = policies
    .filter(
      (policy) =>
        policy.policyKind === policyKind && isEffectiveForDecision(policy, businessAt, decisionAt),
    )
    .sort((left, right) => right.version - left.version);
  if (candidates.some((policy) => !isValidPolicyDefinition(policy))) return null;
  if (candidates.length > 1) return null;
  return candidates[0] ?? null;
}

/** Resolves a historical policy using only facts known at `knowledgeAt`. */
export function resolvePolicyAsKnownAt(
  policies: readonly WorkspacePolicyDto[],
  policyKind: WorkspacePolicyDto["policyKind"],
  businessAt: IsoInstant,
  knowledgeAt: IsoInstant,
): WorkspacePolicyDto | null {
  const candidates = policies
    .filter(
      (policy) =>
        policy.policyKind === policyKind &&
        (policy.state === "approved" || policy.state === "retired") &&
        isApprovedAt(policy, knowledgeAt) &&
        isEffectiveForBusinessTime(policy, businessAt),
    )
    .sort((left, right) => right.version - left.version);
  if (candidates.some((policy) => !isValidPolicyDefinition(policy))) return null;
  if (candidates.length > 1) return null;
  return candidates[0] ?? null;
}

/** Loads a persisted policy for a correction/reopen lineage, including retired rows. */
export function loadHistoricalPolicyLineage(
  policies: readonly WorkspacePolicyDto[],
  policyVersionId: WorkspacePolicyDto["id"],
): WorkspacePolicyDto | null {
  const policy = policies.find((candidate) => candidate.id === policyVersionId) ?? null;
  if (
    policy === null ||
    (policy.state !== "approved" && policy.state !== "retired") ||
    policy.approvedAt === null ||
    !isValidPolicyDefinition(policy)
  ) {
    return null;
  }
  return policy;
}

export function decideApproveWorkspacePolicy(
  command: ApproveWorkspacePolicyCommand,
  current: WorkspacePolicyDto | null,
  recordedAt: IsoInstant,
  existingPolicies: readonly WorkspacePolicyDto[] = [],
): DomainResult<{ policy: WorkspacePolicyDto; audit: AuditDraft }> {
  if (current === null) return err("WORKSPACE_POLICY_NOT_FOUND", "Policy version was not found.");
  if (current.state !== "draft") {
    return err("WORKSPACE_POLICY_NOT_DRAFT", "Only a draft policy version can be approved.");
  }
  if (!isValidPolicyDefinition(current)) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "The policy definition is not a supported typed contract.",
      { policyKind: current.policyKind },
    );
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
  if (
    existingPolicies.some(
      (existing) => existing.policyKind === policy.policyKind && !isValidPolicyDefinition(existing),
    )
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Another policy version of this capability has a corrupt definition.",
      { policyKind: policy.policyKind },
    );
  }
  if (hasOverlappingWorkspacePolicyEffectiveWindow(policy, existingPolicies)) {
    return err(
      "WORKSPACE_POLICY_EFFECTIVE_OVERLAP",
      "An approved policy version overlaps another active version of the same capability.",
      { policyKind: policy.policyKind, version: policy.version },
    );
  }
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
  const effectiveTo = command.payload.effectiveTo ?? current.effectiveTo;
  if (!validEffectiveRange(current.effectiveFrom, effectiveTo)) {
    return err(
      "WORKSPACE_POLICY_EFFECTIVE_RANGE_INVALID",
      "A policy effective end must be later than its effective start.",
    );
  }
  const policy: WorkspacePolicyDto = {
    ...current,
    state: "retired",
    effectiveTo,
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
  knowledgeAt: IsoInstant = asOf,
): readonly WorkspacePolicyAvailability[] {
  // A request for a business time already known to the reader is a historical
  // availability read. A request beyond the knowledge cutoff is a current
  // readiness read, where system retirement closes the capability. This keeps
  // retirement out of the business-effective interval itself.
  const currentRead = Date.parse(asOf) >= Date.parse(knowledgeAt);
  return [...WORKSPACE_POLICY_KINDS].map((policyKind) => {
    if (policyDefinitionSchemas[policyKind] === null) {
      return {
        policyKind,
        availability: "unavailable",
        reason: "unsupported_definition_contract",
        policyVersionId: null,
        version: null,
      } satisfies WorkspacePolicyAvailability;
    }
    const knownVersions = policies
      .filter(
        (policy) =>
          policy.policyKind === policyKind &&
          (policy.state === "approved" || policy.state === "retired") &&
          policy.approvedAt !== null &&
          Date.parse(policy.approvedAt) <= Date.parse(knowledgeAt),
      )
      .sort((left, right) => right.version - left.version);
    const effectiveVersions = knownVersions.filter(
      (policy) =>
        isEffectiveForBusinessTime(policy, asOf) &&
        (!currentRead ||
          policy.retiredAt === null ||
          Date.parse(policy.retiredAt) > Date.parse(knowledgeAt)),
    );
    const hasInvalidDefinition = knownVersions.some((policy) => !isValidPolicyDefinition(policy));
    const latest = knownVersions[0];
    if (hasInvalidDefinition) {
      return {
        policyKind,
        availability: "unavailable",
        reason: "corrupt_definition",
        policyVersionId: null,
        version: null,
      } satisfies WorkspacePolicyAvailability;
    }
    if (effectiveVersions.length > 1) {
      return {
        policyKind,
        availability: "unavailable",
        reason: "corrupt_overlap",
        policyVersionId: null,
        version: null,
      } satisfies WorkspacePolicyAvailability;
    }
    const effective = effectiveVersions[0];
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
