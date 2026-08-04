import type {
  CashStatementMatchDto,
  CommandEnvelope,
  OperationalCloseDto,
  RecordCashStatementMatchCommand,
  RecordOperationalCloseCommand,
  ReopenOperationalCloseCommand,
  ReverseCashStatementMatchCommand,
  WorkspacePolicyDto,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import {
  cashCustodyDepositPolicyDefinitionSchema,
  operationalClosePolicyDefinitionSchema,
  recordCashStatementMatchCommandSchema,
  recordOperationalCloseCommandSchema,
  reopenOperationalCloseCommandSchema,
  reverseCashStatementMatchCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideRecordCashStatementMatch,
  decideRecordOperationalClose,
  decideReopenOperationalClose,
  decideReverseCashStatementMatch,
  err,
  ok,
  resolveEffectiveWorkspacePolicy,
} from "@vuarau/domain-kernel";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { vietnamBusinessDayRange } from "@vuarau/domain-contracts";

async function effectiveClosePolicy(
  repos: Repositories,
  workspaceId: RecordOperationalCloseCommand["workspaceId"],
  asOf: RecordOperationalCloseCommand["occurredAt"],
  knowledgeAt: RecordOperationalCloseCommand["occurredAt"],
) {
  const policy = resolveEffectiveWorkspacePolicy(
    await repos.workspacePolicyReads.listAll(workspaceId),
    "operating_cycle_reconciliation",
    asOf,
    knowledgeAt,
  );
  if (policy === null) {
    return err(
      "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE",
      "An approved operational close policy is required.",
    );
  }
  const definition = operationalClosePolicyDefinitionSchema.safeParse(policy.definition);
  if (!definition.success) {
    return err(
      "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE",
      "The effective operational close policy is invalid.",
    );
  }
  return ok({ policy, definition: definition.data });
}

async function effectiveDepositPolicy(
  repos: Repositories,
  workspaceId: RecordCashStatementMatchCommand["workspaceId"],
  asOf: RecordCashStatementMatchCommand["payload"]["statementAt"],
  knowledgeAt: RecordCashStatementMatchCommand["occurredAt"],
) {
  const policy = resolveEffectiveWorkspacePolicy(
    await repos.workspacePolicyReads.listAll(workspaceId),
    "cash_custody_deposit",
    asOf,
    knowledgeAt,
  );
  if (policy === null) {
    return err(
      "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE",
      "An approved cash deposit policy is required.",
    );
  }
  const definition = cashCustodyDepositPolicyDefinitionSchema.safeParse(policy.definition);
  if (!definition.success) {
    return err(
      "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE",
      "The effective cash deposit policy is invalid.",
    );
  }
  return ok({ policy, definition: definition.data });
}

async function policyByVersion<T>(
  repos: Repositories,
  workspaceId: RecordCashStatementMatchCommand["workspaceId"],
  policyVersionId: WorkspacePolicyVersionId,
  schema: { safeParse(input: unknown): { success: true; data: T } | { success: false } },
): Promise<DomainResult<{ policy: WorkspacePolicyDto; definition: T }>> {
  const current = await repos.workspacePolicies.findById(workspaceId, policyVersionId);
  if (current === null || current.state !== "approved") {
    return err(
      "OPERATIONAL_CLOSE_POLICY_UNAVAILABLE",
      "Policy lineage is missing or no longer approved.",
    );
  }
  const definition = schema.safeParse(current.definition);
  if (!definition.success) {
    return err("OPERATIONAL_CLOSE_POLICY_UNAVAILABLE", "Policy lineage is invalid.");
  }
  return ok({ policy: current, definition: definition.data });
}

function auditBase(
  command: Pick<CommandEnvelope, "workspaceId" | "actorId" | "commandId" | "occurredAt">,
  recordedAt: CommandEnvelope["occurredAt"],
) {
  return {
    workspaceId: command.workspaceId,
    actorId: command.actorId,
    commandId: command.commandId,
    transactionTime: command.occurredAt,
    recordedAt,
  };
}

export function recordOperationalClose(ctx: CommandContext, input: unknown) {
  return runCommand<RecordOperationalCloseCommand, OperationalCloseDto>({
    commandType: "RecordOperationalClose",
    schema: recordOperationalCloseCommandSchema,
    input,
    ctx,
    requiredPermission: "operations.close",
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const period = vietnamBusinessDayRange(
        command.payload.businessDate,
        operationalProfile.businessDayStartMinute,
      );
      const policy = await effectiveClosePolicy(repos, command.workspaceId, period.end, recordedAt);
      if (!policy.ok) return policy;
      const existing = await repos.operationalCloses.findByBusinessDate(
        command.workspaceId,
        command.payload.businessDate,
      );
      if (existing !== null) {
        return err("OPERATIONAL_CLOSE_ALREADY_EXISTS", "This business date is already closed.");
      }
      const observations = await Promise.all(
        command.payload.observationIds.map((id) =>
          repos.reconciliationObservations.findById(command.workspaceId, id),
        ),
      );
      const found = observations.filter(
        (observation): observation is NonNullable<typeof observation> => observation !== null,
      );
      const decision = decideRecordOperationalClose(
        command,
        found,
        policy.value.definition,
        policy.value.policy.id,
        period,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (!(await repos.operationalCloses.insert(decision.value.close))) {
        return err("OPERATIONAL_CLOSE_ALREADY_EXISTS", "This business date is already closed.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        ...decision.value.audit,
      });
      return ok(decision.value.close);
    },
  });
}

export function reopenOperationalClose(ctx: CommandContext, input: unknown) {
  return runCommand<ReopenOperationalCloseCommand, OperationalCloseDto>({
    commandType: "ReopenOperationalClose",
    schema: reopenOperationalCloseCommandSchema,
    input,
    ctx,
    requiredPermission: "operations.close",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.operationalCloses.findByIdForUpdate(
        command.workspaceId,
        command.payload.operationalCloseId,
      );
      if (current === null) return err("OPERATIONAL_CLOSE_NOT_FOUND", "No such operational close.");
      const policy = await policyByVersion(
        repos,
        command.workspaceId,
        current.policyVersionId,
        operationalClosePolicyDefinitionSchema,
      );
      if (!policy.ok) return policy;
      const decision = decideReopenOperationalClose(
        command,
        current,
        policy.value.definition,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (
        !(await repos.operationalCloses.insertReopen(
          command.workspaceId,
          current.id,
          decision.value.reopen,
        ))
      ) {
        return err("OPERATIONAL_CLOSE_ALREADY_REOPENED", "Operational close is already reopened.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        ...decision.value.audit,
      });
      return ok({
        ...current,
        state: "reopened",
        version: current.version + 1,
        reopen: decision.value.reopen,
      });
    },
  });
}

export function recordCashStatementMatch(ctx: CommandContext, input: unknown) {
  return runCommand<RecordCashStatementMatchCommand, CashStatementMatchDto>({
    commandType: "RecordCashStatementMatch",
    schema: recordCashStatementMatchCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.statement.match",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const policy = await effectiveDepositPolicy(
        repos,
        command.workspaceId,
        command.payload.statementAt,
        recordedAt,
      );
      if (!policy.ok) return policy;
      const movement =
        (
          await repos.cashMovements.listByAccount(
            command.workspaceId,
            command.payload.cashAccountId,
          )
        ).find((candidate) => candidate.id === command.payload.cashMovementId) ?? null;
      const existingByMovement = await repos.cashStatementMatches.findByMovementId(
        command.workspaceId,
        command.payload.cashMovementId,
      );
      const existingByReference = await repos.cashStatementMatches.findByExternalReference(
        command.workspaceId,
        command.payload.externalReference,
      );
      const existing = existingByMovement ?? existingByReference;
      const decision = decideRecordCashStatementMatch(
        command,
        movement,
        policy.value.definition,
        policy.value.policy.id,
        existing,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (existing !== null) return ok(existing);
      if (!(await repos.cashStatementMatches.insert(decision.value.match))) {
        return err(
          "CASH_STATEMENT_MATCH_ALREADY_EXISTS",
          "Statement match identity already exists.",
        );
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        ...decision.value.audit,
      });
      return ok(decision.value.match);
    },
  });
}

export function reverseCashStatementMatch(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseCashStatementMatchCommand, CashStatementMatchDto>({
    commandType: "ReverseCashStatementMatch",
    schema: reverseCashStatementMatchCommandSchema,
    input,
    ctx,
    requiredPermission: "cash.statement.match",
    requiredWorkflows: ["cashbook"],
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.cashStatementMatches.findByIdForUpdate(
        command.workspaceId,
        command.payload.cashStatementMatchId,
      );
      if (current === null)
        return err("CASH_STATEMENT_MATCH_NOT_FOUND", "No such statement match.");
      const policy = await policyByVersion(
        repos,
        command.workspaceId,
        current.policyVersionId,
        cashCustodyDepositPolicyDefinitionSchema,
      );
      if (!policy.ok) return policy;
      const decision = decideReverseCashStatementMatch(
        command,
        current,
        policy.value.definition,
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (
        !(await repos.cashStatementMatches.insertReversal({
          id: decision.value.reversal.id,
          workspaceId: command.workspaceId,
          cashStatementMatchId: current.id,
          reason: decision.value.reversal.reason,
          evidenceReferences: decision.value.reversal.evidenceReferences,
          transactionTime: decision.value.reversal.transactionTime,
          recordedAt: decision.value.reversal.recordedAt,
          actorId: decision.value.reversal.actorId,
          commandId: decision.value.reversal.commandId,
        }))
      ) {
        return err("CASH_STATEMENT_MATCH_ALREADY_REVERSED", "Statement match is already reversed.");
      }
      await repos.audit.append({
        ...auditBase(command, recordedAt),
        ...decision.value.audit,
      });
      return ok({
        ...current,
        version: current.version + 1,
        reversal: decision.value.reversal,
      });
    },
  });
}
