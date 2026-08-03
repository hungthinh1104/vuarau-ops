import type {
  CostObservationDto,
  RecordCostObservationCommand,
  ReconciliationObservationDto,
  RecordReconciliationObservationCommand,
  DebtObservationDto,
  RecordDebtObservationCommand,
} from "@vuarau/domain-contracts";
import { recordCostObservationCommandSchema } from "@vuarau/domain-contracts";
import { recordReconciliationObservationCommandSchema } from "@vuarau/domain-contracts";
import { recordDebtObservationCommandSchema } from "@vuarau/domain-contracts";
import {
  decideRecordCostObservation,
  decideRecordReconciliationObservation,
  decideRecordDebtObservation,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export function recordCostObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordCostObservationCommand, CostObservationDto>({
    commandType: "RecordCostObservation",
    schema: recordCostObservationCommandSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.costObservations.findById(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const decision = decideRecordCostObservation(command, recordedAt, target !== null);
      if (!decision.ok) return decision;
      if (!(await repos.costObservations.insert(decision.value.observation))) {
        return err(
          "COST_OBSERVATION_ALREADY_RECORDED",
          "Cost observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordReconciliationObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordReconciliationObservationCommand, ReconciliationObservationDto>({
    commandType: "RecordReconciliationObservation",
    schema: recordReconciliationObservationCommandSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.reconciliationObservations.findById(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const decision = decideRecordReconciliationObservation(command, recordedAt, target !== null);
      if (!decision.ok) return decision;
      if (!(await repos.reconciliationObservations.insert(decision.value.observation))) {
        return err(
          "RECONCILIATION_OBSERVATION_ALREADY_RECORDED",
          "Reconciliation observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordDebtObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordDebtObservationCommand, DebtObservationDto>({
    commandType: "RecordDebtObservation",
    schema: recordDebtObservationCommandSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.debtObservations.findById(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const decision = decideRecordDebtObservation(command, recordedAt, target !== null);
      if (!decision.ok) return decision;
      if (!(await repos.debtObservations.insert(decision.value.observation))) {
        return err(
          "DEBT_OBSERVATION_ALREADY_RECORDED",
          "Debt observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}
