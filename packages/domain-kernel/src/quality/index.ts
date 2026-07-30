import type {
  CreateQualityGradeCommand,
  DeactivateQualityGradeCommand,
  IsoInstant,
  ReactivateQualityGradeCommand,
  UpdateQualityGradeCommand,
} from "@vuarau/domain-contracts";
import type { QualityGradeState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export function decideCreateQualityGrade(
  command: CreateQualityGradeCommand,
  recordedAt: IsoInstant,
): DomainResult<QualityGradeState> {
  const name = command.payload.name.trim();
  if (name.length === 0) return err("INVALID_COMMAND_PAYLOAD", "Quality grade name is required.");
  return ok({
    id: command.payload.qualityGradeId,
    workspaceId: command.workspaceId,
    name,
    sortOrder: command.payload.sortOrder,
    isActive: true,
    version: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}

export function decideUpdateQualityGrade(
  current: QualityGradeState,
  command: UpdateQualityGradeCommand,
  recordedAt: IsoInstant,
): DomainResult<QualityGradeState> {
  if (current.version !== command.expectedVersion)
    return err("QUALITY_GRADE_VERSION_CONFLICT", "Quality grade changed on the server.");
  const name = command.payload.name.trim();
  if (name.length === 0) return err("INVALID_COMMAND_PAYLOAD", "Quality grade name is required.");
  return ok({
    ...current,
    name,
    sortOrder: command.payload.sortOrder,
    version: current.version + 1,
    updatedAt: recordedAt,
  });
}

export function decideQualityGradeLifecycle(
  current: QualityGradeState,
  command: DeactivateQualityGradeCommand | ReactivateQualityGradeCommand,
  active: boolean,
  recordedAt: IsoInstant,
): DomainResult<QualityGradeState> {
  if (current.version !== command.expectedVersion)
    return err("QUALITY_GRADE_VERSION_CONFLICT", "Quality grade changed on the server.");
  if (current.isActive === active)
    return err(
      "INVALID_COMMAND_PAYLOAD",
      `Quality grade is already ${active ? "active" : "inactive"}.`,
    );
  return ok({
    ...current,
    isActive: active,
    version: current.version + 1,
    updatedAt: recordedAt,
  });
}
