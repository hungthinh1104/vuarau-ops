import type {
  CostObservationDto,
  RecordCostObservationCommand,
  IsoInstant,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export function decideRecordCostObservation(
  command: RecordCostObservationCommand,
  recordedAt: IsoInstant,
  correctionTargetExists: boolean,
): DomainResult<{ observation: CostObservationDto; audit: AuditDraft }> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "COST_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A correction observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "COST_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction observation may link to an earlier observation.",
    );
  }
  if (payload.caseKind === "correction" && !correctionTargetExists) {
    return err(
      "COST_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The observation being corrected was not found in this workspace.",
    );
  }

  const observation: CostObservationDto = {
    id: payload.costObservationId,
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

  return ok({
    observation,
    audit: {
      aggregateType: "cost_observation",
      aggregateId: observation.id,
      action: "cost_observation.recorded",
      transactionTime: observation.transactionTime,
      recordedAt,
      before: null,
      after: {
        kind: observation.kind,
        caseKind: observation.caseKind,
        relatedObservationId: observation.relatedObservationId,
        hasAmount: observation.facts.amount !== null,
        hasQuantity: observation.facts.quantity !== null,
      },
      reason: observation.description,
    },
  });
}
