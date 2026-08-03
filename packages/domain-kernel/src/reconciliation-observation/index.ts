import type {
  IsoInstant,
  ReconciliationObservationDto,
  RecordReconciliationObservationCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export function decideRecordReconciliationObservation(
  command: RecordReconciliationObservationCommand,
  recordedAt: IsoInstant,
  correctionTargetExists: boolean,
): DomainResult<{
  observation: ReconciliationObservationDto;
  audit: AuditDraft;
}> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A correction observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction observation may link to an earlier observation.",
    );
  }
  if (payload.caseKind === "correction" && !correctionTargetExists) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The observation being corrected was not found in this workspace.",
    );
  }

  const observation: ReconciliationObservationDto = {
    id: payload.reconciliationObservationId,
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
    aggregateType: "reconciliation_observation",
    aggregateId: observation.id,
    action: "reconciliation_observation.recorded",
    transactionTime: observation.transactionTime,
    recordedAt,
    before: null,
    after: {
      kind: observation.kind,
      caseKind: observation.caseKind,
      relatedObservationId: observation.relatedObservationId,
      hasExpectedAmount: observation.facts.expectedAmount !== null,
      hasObservedAmount: observation.facts.observedAmount !== null,
      hasExpectedQuantity: observation.facts.expectedQuantity !== null,
      hasObservedQuantity: observation.facts.observedQuantity !== null,
    },
    reason: observation.description,
  };

  return ok({ observation, audit });
}
