import type {
  DebtObservationDto,
  IsoInstant,
  RecordDebtObservationCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

/**
 * Debt observations are source facts only. They never derive overdue state,
 * allocate a payment, or append a customer-account entry.
 */
export function decideRecordDebtObservation(
  command: RecordDebtObservationCommand,
  recordedAt: IsoInstant,
  correctionTargetExists: boolean,
): DomainResult<{ observation: DebtObservationDto; audit: AuditDraft }> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "DEBT_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A correction observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "DEBT_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction observation may link to an earlier observation.",
    );
  }
  if (payload.caseKind === "correction" && !correctionTargetExists) {
    return err(
      "DEBT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The observation being corrected was not found in this workspace.",
    );
  }

  const observation: DebtObservationDto = {
    id: payload.debtObservationId,
    workspaceId: command.workspaceId,
    kind: payload.kind,
    caseKind: payload.caseKind,
    description: payload.description,
    participantWording: payload.participantWording,
    facts: payload.facts,
    evidenceReferences: [...payload.evidenceReferences],
    relatedObservationId: payload.relatedObservationId,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  const audit: AuditDraft = {
    aggregateType: "debt_observation",
    aggregateId: observation.id,
    action: "debt_observation.recorded",
    transactionTime: observation.transactionTime,
    recordedAt,
    before: null,
    after: {
      kind: observation.kind,
      caseKind: observation.caseKind,
      relatedObservationId: observation.relatedObservationId,
      hasAmount: observation.facts.amount !== null,
      hasDueDate: observation.facts.agreedDueAt !== null,
      hasPromiseDate: observation.facts.promiseToPayAt !== null,
    },
    reason: observation.description,
  };

  return ok({ observation, audit });
}
