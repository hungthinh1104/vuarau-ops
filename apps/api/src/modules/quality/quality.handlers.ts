import type {
  AuditAction,
  CreateQualityGradeCommand,
  DeactivateQualityGradeCommand,
  QualityGradeDto,
  ReactivateQualityGradeCommand,
  UpdateQualityGradeCommand,
} from "@vuarau/domain-contracts";
import {
  createQualityGradeCommandSchema,
  deactivateQualityGradeCommandSchema,
  reactivateQualityGradeCommandSchema,
  updateQualityGradeCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideCreateQualityGrade,
  decideQualityGradeLifecycle,
  decideUpdateQualityGrade,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { DomainResult, QualityGradeState } from "@vuarau/domain-kernel";
import type { z } from "zod";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

const dto = (grade: QualityGradeState): QualityGradeDto => ({ ...grade });

export function createQualityGrade(ctx: CommandContext, input: unknown) {
  return runCommand<CreateQualityGradeCommand, QualityGradeDto>({
    commandType: "CreateQualityGrade",
    schema: createQualityGradeCommandSchema,
    input,
    ctx,
    requiredPermission: "quality.manage",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.qualityGrades.findById(
          command.workspaceId,
          command.payload.qualityGradeId,
        )) !== null
      )
        return err("QUALITY_GRADE_VERSION_CONFLICT", "Quality grade identity already exists.");
      const decision = decideCreateQualityGrade(command, recordedAt);
      if (!decision.ok) return decision;
      await repos.qualityGrades.insert(decision.value);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "quality_grade",
        aggregateId: decision.value.id,
        action: "quality_grade.created",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { name: decision.value.name, sortOrder: decision.value.sortOrder, isActive: true },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

function mutate<
  TCommand extends
    UpdateQualityGradeCommand | DeactivateQualityGradeCommand | ReactivateQualityGradeCommand,
>(args: {
  ctx: CommandContext;
  input: unknown;
  commandType: string;
  schema: z.ZodType<TCommand>;
  decide: (
    current: QualityGradeState,
    command: TCommand,
    recordedAt: QualityGradeState["updatedAt"],
  ) => DomainResult<QualityGradeState>;
  action: AuditAction;
}) {
  return runCommand<TCommand, QualityGradeDto>({
    commandType: args.commandType,
    schema: args.schema,
    input: args.input,
    ctx: args.ctx,
    requiredPermission: "quality.manage",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.qualityGrades.findByIdForUpdate(
        command.workspaceId,
        command.payload.qualityGradeId,
      );
      if (current === null) return err("QUALITY_GRADE_NOT_FOUND", "No such quality grade.");
      const decision = args.decide(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.qualityGrades.update(decision.value, current.version)))
        return err("QUALITY_GRADE_VERSION_CONFLICT", "Quality grade changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "quality_grade",
        aggregateId: current.id,
        action: args.action,
        transactionTime: command.occurredAt,
        recordedAt,
        before: { name: current.name, isActive: current.isActive, version: current.version },
        after: {
          name: decision.value.name,
          isActive: decision.value.isActive,
          version: decision.value.version,
        },
        reason: "reason" in command.payload ? command.payload.reason : null,
      });
      return ok(dto(decision.value));
    },
  });
}

export const updateQualityGrade = (ctx: CommandContext, input: unknown) =>
  mutate<UpdateQualityGradeCommand>({
    ctx,
    input,
    commandType: "UpdateQualityGrade",
    schema: updateQualityGradeCommandSchema,
    action: "quality_grade.updated",
    decide: decideUpdateQualityGrade,
  });

export const deactivateQualityGrade = (ctx: CommandContext, input: unknown) =>
  mutate<DeactivateQualityGradeCommand>({
    ctx,
    input,
    commandType: "DeactivateQualityGrade",
    schema: deactivateQualityGradeCommandSchema,
    action: "quality_grade.deactivated",
    decide: (current, command, recordedAt) =>
      decideQualityGradeLifecycle(current, command, false, recordedAt),
  });

export const reactivateQualityGrade = (ctx: CommandContext, input: unknown) =>
  mutate<ReactivateQualityGradeCommand>({
    ctx,
    input,
    commandType: "ReactivateQualityGrade",
    schema: reactivateQualityGradeCommandSchema,
    action: "quality_grade.reactivated",
    decide: (current, command, recordedAt) =>
      decideQualityGradeLifecycle(current, command, true, recordedAt),
  });
