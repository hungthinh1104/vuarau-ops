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
  cashCustodyDepositPolicyDefinitionSchema,
  creditLimitPolicyDefinitionSchema,
  costAllocationPolicyDefinitionSchema,
  inventoryValuationPolicyDefinitionSchema,
  managementIntelligencePolicyDefinitionSchema,
  paymentAllocationPolicyDefinitionSchema,
  paymentTermsAgingPolicyDefinitionSchema,
  purchaseCorrectionPolicyDefinitionSchema,
  stockPlanningPolicyDefinitionSchema,
  stocktakeVariancePolicyDefinitionSchema,
  operationalClosePolicyDefinitionSchema,
  supplierEvaluationPolicyDefinitionSchema,
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
  if (
    command.payload.policyKind === "purchase_correction" &&
    !purchaseCorrectionPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Purchase correction policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "inventory_valuation" &&
    !inventoryValuationPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Inventory valuation policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "cost_allocation" &&
    !costAllocationPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Cost allocation policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "payment_terms_aging" &&
    !paymentTermsAgingPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Payment terms and aging policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "payment_allocation" &&
    !paymentAllocationPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Payment allocation policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "credit_limit" &&
    !creditLimitPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Credit control policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "stock_planning_reorder" &&
    !stockPlanningPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Stock planning policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "stocktake_variance" &&
    !stocktakeVariancePolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Stocktake variance policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "operating_cycle_reconciliation" &&
    !operationalClosePolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Operational close policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "cash_custody_deposit" &&
    !cashCustodyDepositPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Cash custody and deposit policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "supplier_evaluation" &&
    !supplierEvaluationPolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Supplier evaluation policy definition is not a supported contract.",
    );
  }
  if (
    command.payload.policyKind === "management_intelligence" &&
    !managementIntelligencePolicyDefinitionSchema.safeParse(command.payload.definition).success
  ) {
    return err(
      "WORKSPACE_POLICY_DEFINITION_INVALID",
      "Management intelligence policy definition is not a supported contract.",
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

/** Returns the highest version that is approved and effective at `asOf`. */
export function resolveEffectiveWorkspacePolicy(
  policies: readonly WorkspacePolicyDto[],
  policyKind: WorkspacePolicyDto["policyKind"],
  asOf: IsoInstant,
): WorkspacePolicyDto | null {
  return (
    policies
      .filter(
        (policy) =>
          policy.policyKind === policyKind &&
          policy.state === "approved" &&
          Date.parse(asOf) >= Date.parse(policy.effectiveFrom) &&
          (policy.effectiveTo === null || Date.parse(asOf) < Date.parse(policy.effectiveTo)),
      )
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
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
