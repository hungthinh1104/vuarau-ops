import type {
  IsoInstant,
  UpdateWorkspaceOperationalProfileCommand,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type OperationalProfileDecision = {
  readonly profile: WorkspaceOperationalProfileDto;
  readonly audit: AuditDraft;
};

export function decideUpdateWorkspaceOperationalProfile(args: {
  command: UpdateWorkspaceOperationalProfileCommand;
  current: WorkspaceOperationalProfileDto;
  recordedAt: IsoInstant;
}): DomainResult<OperationalProfileDecision> {
  const { command, current, recordedAt } = args;
  if (command.expectedVersion !== current.version) {
    return err("WORKSPACE_PROFILE_VERSION_CONFLICT", "Workspace profile changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  const nextFields = {
    purchasingMode: command.payload.purchasingMode,
    inventoryMode: command.payload.inventoryMode,
    qualityGradeMode: command.payload.qualityGradeMode,
    deliveryMode: command.payload.deliveryMode,
    cashbookMode: command.payload.cashbookMode,
    intakeMode: command.payload.intakeMode,
    weighingMode: command.payload.weighingMode,
    businessDayStartMinute: command.payload.businessDayStartMinute,
  } as const;
  const unchanged =
    current.purchasingMode === nextFields.purchasingMode &&
    current.inventoryMode === nextFields.inventoryMode &&
    current.qualityGradeMode === nextFields.qualityGradeMode &&
    current.deliveryMode === nextFields.deliveryMode &&
    current.cashbookMode === nextFields.cashbookMode &&
    current.intakeMode === nextFields.intakeMode &&
    current.weighingMode === nextFields.weighingMode &&
    current.businessDayStartMinute === nextFields.businessDayStartMinute;
  if (unchanged) {
    return err("WORKSPACE_PROFILE_UNCHANGED", "Workspace profile already has these settings.");
  }
  const profile = { ...current, ...nextFields, version: current.version + 1 };
  return ok({
    profile,
    audit: {
      aggregateType: "workspace",
      aggregateId: current.workspaceId,
      action: "workspace.operational_profile_updated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: {
        purchasingMode: current.purchasingMode,
        inventoryMode: current.inventoryMode,
        qualityGradeMode: current.qualityGradeMode,
        deliveryMode: current.deliveryMode,
        cashbookMode: current.cashbookMode,
        intakeMode: current.intakeMode,
        weighingMode: current.weighingMode,
        businessDayStartMinute: current.businessDayStartMinute,
        version: current.version,
      },
      after: { ...nextFields, version: profile.version },
      reason: command.payload.reason,
    },
  });
}
