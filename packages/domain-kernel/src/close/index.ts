import type {
  CashCustodyDepositPolicyDefinition,
  CashMovementForStatementMatch,
  CashStatementMatchDto,
  IsoInstant,
  OperationalCloseDto,
  OperationalClosePolicyDefinition,
  RecordCashStatementMatchCommand,
  RecordOperationalCloseCommand,
  ReconciliationObservationDto,
  ReopenOperationalCloseCommand,
  ReverseCashStatementMatchCommand,
  WorkspacePolicyVersionId,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function requiredObservationSet(
  observations: readonly ReconciliationObservationDto[],
  requiredKinds: readonly ReconciliationObservationDto["kind"][],
): DomainResult<void> {
  const seen = new Set(observations.map((observation) => observation.kind));
  if (observations.length !== requiredKinds.length || seen.size !== observations.length) {
    return err(
      "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID",
      "A close must include exactly one observation for every required scope.",
    );
  }
  if (requiredKinds.some((kind) => !seen.has(kind))) {
    return err(
      "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID",
      "A close is missing one or more required reconciliation observations.",
    );
  }
  if (
    observations.some(
      (observation) =>
        observation.facts.expectedAmount === null &&
        observation.facts.observedAmount === null &&
        observation.facts.expectedQuantity === null &&
        observation.facts.observedQuantity === null &&
        observation.facts.itemCount === null,
    )
  ) {
    return err(
      "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID",
      "Every close observation must carry a measurable expected or observed fact.",
    );
  }
  return ok(undefined);
}

export function decideRecordOperationalClose(
  command: RecordOperationalCloseCommand,
  observations: readonly ReconciliationObservationDto[],
  policy: OperationalClosePolicyDefinition,
  policyVersionId: WorkspacePolicyVersionId,
  period: OperationalCloseDto["period"],
  recordedAt: IsoInstant,
  supersedesOperationalCloseId: OperationalCloseDto["id"] | null = null,
  version = 1,
): DomainResult<{ close: OperationalCloseDto; audit: AuditDraft }> {
  if (observations.some((observation) => observation.workspaceId !== command.workspaceId)) {
    return err("WORKSPACE_ACCESS_DENIED", "Close observations must belong to the workspace.");
  }
  if (observations.length !== command.payload.observationIds.length) {
    return err(
      "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID",
      "Every requested close observation must exist in the workspace.",
    );
  }
  const observationCheck = requiredObservationSet(
    observations,
    policy.parameters.requiredObservationKinds,
  );
  if (!observationCheck.ok) return observationCheck;
  if (
    observations.some(
      (observation) =>
        Date.parse(observation.transactionTime) < Date.parse(period.start) ||
        Date.parse(observation.transactionTime) >= Date.parse(period.end),
    )
  ) {
    return err(
      "OPERATIONAL_CLOSE_OBSERVATIONS_INVALID",
      "Every close observation must belong to the closed business period.",
    );
  }
  const close: OperationalCloseDto = {
    id: command.payload.operationalCloseId,
    workspaceId: command.workspaceId,
    businessDate: command.payload.businessDate,
    supersedesOperationalCloseId,
    period,
    state: "closed",
    version,
    observationIds: [...command.payload.observationIds],
    evidenceReferences: [...command.payload.evidenceReferences],
    policyVersionId,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reason: command.payload.reason,
    reopen: null,
  };
  return ok({
    close,
    audit: {
      aggregateType: "operational_close",
      aggregateId: close.id,
      action: "operational_close.recorded",
      transactionTime: close.transactionTime,
      recordedAt,
      before: null,
      after: {
        businessDate: close.businessDate,
        period: close.period,
        policyVersionId: close.policyVersionId,
        observationCount: close.observationIds.length,
      },
      reason: close.reason,
    },
  });
}

export function decideReopenOperationalClose(
  command: ReopenOperationalCloseCommand,
  current: OperationalCloseDto,
  policy: OperationalClosePolicyDefinition,
  recordedAt: IsoInstant,
): DomainResult<{ reopen: NonNullable<OperationalCloseDto["reopen"]>; audit: AuditDraft }> {
  if (!policy.parameters.allowReopen) {
    return err(
      "OPERATIONAL_CLOSE_REOPEN_UNAVAILABLE",
      "The active close policy does not allow reopen.",
    );
  }
  if (current.workspaceId !== command.workspaceId) {
    return err("WORKSPACE_ACCESS_DENIED", "Close belongs to another workspace.");
  }
  if (command.expectedVersion !== current.version) {
    return err("OPERATIONAL_CLOSE_VERSION_CONFLICT", "Operational close changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  if (current.state === "reopened" || current.reopen !== null) {
    return err("OPERATIONAL_CLOSE_ALREADY_REOPENED", "Operational close is already reopened.");
  }
  const reopen = {
    id: command.payload.reopenId,
    reason: command.payload.reason,
    evidenceReferences: [...command.payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  } satisfies NonNullable<OperationalCloseDto["reopen"]>;
  return ok({
    reopen,
    audit: {
      aggregateType: "operational_close",
      aggregateId: current.id,
      action: "operational_close.reopened",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { state: current.state, version: current.version },
      after: { state: "reopened", version: current.version + 1, reopenId: reopen.id },
      reason: reopen.reason,
    },
  });
}

export function decideRecordCashStatementMatch(
  command: RecordCashStatementMatchCommand,
  movement: CashMovementForStatementMatch | null,
  policy: CashCustodyDepositPolicyDefinition,
  policyVersionId: WorkspacePolicyVersionId,
  existing: CashStatementMatchDto | null,
  recordedAt: IsoInstant,
): DomainResult<{ match: CashStatementMatchDto; audit: AuditDraft }> {
  if (movement === null) return err("CASH_MOVEMENT_NOT_FOUND", "Cash movement was not found.");
  if (movement.workspaceId !== command.workspaceId) {
    return err("WORKSPACE_ACCESS_DENIED", "Cash movement belongs to another workspace.");
  }
  if (movement.cashAccountId !== command.payload.cashAccountId) {
    return err("CASH_STATEMENT_ACCOUNT_MISMATCH", "Statement account does not match the movement.");
  }
  if (
    movement.amount.amountMinor !== command.payload.amount.amountMinor ||
    movement.amount.currency !== command.payload.amount.currency
  ) {
    return err(
      "CASH_STATEMENT_AMOUNT_MISMATCH",
      "Statement amount must exactly match the cash movement.",
    );
  }
  if (!policy.parameters.allowedSourceTypes.includes(movement.sourceType)) {
    return err(
      "CASH_STATEMENT_SOURCE_NOT_ALLOWED",
      "The active deposit policy does not allow this movement source.",
    );
  }
  if (existing !== null) {
    if (
      existing.externalReference === command.payload.externalReference &&
      existing.cashMovementId === movement.id
    ) {
      return ok({
        match: existing,
        audit: {
          aggregateType: "cash_statement_match",
          aggregateId: existing.id,
          action: "cash_statement_match.recorded",
          transactionTime: existing.transactionTime,
          recordedAt,
          before: null,
          after: { replay: true, version: existing.version },
          reason: null,
        },
      });
    }
    return err(
      "CASH_STATEMENT_MATCH_ALREADY_EXISTS",
      "The cash movement is already matched to a statement.",
    );
  }
  const match: CashStatementMatchDto = {
    id: command.payload.cashStatementMatchId,
    workspaceId: command.workspaceId,
    cashAccountId: command.payload.cashAccountId,
    cashMovementId: movement.id,
    externalReference: command.payload.externalReference,
    statementAt: command.payload.statementAt,
    amount: command.payload.amount,
    sourceType: movement.sourceType,
    policyVersionId,
    evidenceReferences: [...command.payload.evidenceReferences],
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    match,
    audit: {
      aggregateType: "cash_statement_match",
      aggregateId: match.id,
      action: "cash_statement_match.recorded",
      transactionTime: match.transactionTime,
      recordedAt,
      before: null,
      after: {
        cashAccountId: match.cashAccountId,
        cashMovementId: match.cashMovementId,
        externalReference: match.externalReference,
        amount: match.amount,
        policyVersionId: match.policyVersionId,
      },
      reason: null,
    },
  });
}

export function decideReverseCashStatementMatch(
  command: ReverseCashStatementMatchCommand,
  current: CashStatementMatchDto,
  policy: CashCustodyDepositPolicyDefinition,
  recordedAt: IsoInstant,
): DomainResult<{ reversal: NonNullable<CashStatementMatchDto["reversal"]>; audit: AuditDraft }> {
  if (!policy.parameters.allowReverse) {
    return err(
      "CASH_STATEMENT_REVERSE_UNAVAILABLE",
      "The active deposit policy does not allow correction.",
    );
  }
  if (current.workspaceId !== command.workspaceId) {
    return err("WORKSPACE_ACCESS_DENIED", "Statement match belongs to another workspace.");
  }
  if (command.expectedVersion !== current.version) {
    return err("CASH_STATEMENT_MATCH_VERSION_CONFLICT", "Statement match changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  if (current.reversal !== null) {
    return err("CASH_STATEMENT_MATCH_ALREADY_REVERSED", "Statement match is already reversed.");
  }
  const reversal = {
    id: command.payload.reversalId,
    reason: command.payload.reason,
    evidenceReferences: [...command.payload.evidenceReferences],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  } satisfies NonNullable<CashStatementMatchDto["reversal"]>;
  return ok({
    reversal,
    audit: {
      aggregateType: "cash_statement_match",
      aggregateId: current.id,
      action: "cash_statement_match.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { version: current.version, reversed: false },
      after: { version: current.version + 1, reversed: true, reversalId: reversal.id },
      reason: reversal.reason,
    },
  });
}
