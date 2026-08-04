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
  correctionTarget: ReconciliationObservationDto | null,
  correctionTargetAlreadyCorrected: boolean,
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
  if (payload.caseKind === "correction" && correctionTarget === null) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The observation being corrected was not found in this workspace.",
    );
  }
  if (payload.caseKind === "correction" && correctionTargetAlreadyCorrected) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED",
      "Only the current reconciliation observation chain tip may be corrected.",
    );
  }
  if (
    payload.caseKind === "correction" &&
    correctionTarget !== null &&
    (correctionTarget.kind !== payload.kind ||
      correctionTarget.facts.productId !== payload.facts.productId ||
      correctionTarget.facts.qualityGradeId !== payload.facts.qualityGradeId ||
      correctionTarget.facts.scopeReference !== payload.facts.scopeReference ||
      correctionTarget.facts.expectedAmount?.currency !== payload.facts.expectedAmount?.currency ||
      correctionTarget.facts.observedAmount?.currency !== payload.facts.observedAmount?.currency ||
      correctionTarget.facts.expectedQuantity?.unit !== payload.facts.expectedQuantity?.unit ||
      correctionTarget.facts.observedQuantity?.unit !== payload.facts.observedQuantity?.unit)
  ) {
    return err(
      "RECONCILIATION_OBSERVATION_CORRECTION_IDENTITY_MISMATCH",
      "A reconciliation correction must preserve the scope, kind, product, grade, unit and currency identity.",
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
