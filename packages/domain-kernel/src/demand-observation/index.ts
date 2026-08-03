import type {
  DemandObservationDto,
  IsoInstant,
  RecordDemandObservationCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

/**
 * Demand observations preserve a request before it becomes a Sale. This
 * decision never creates financial or goods truth and never infers shortage or
 * reorder meaning.
 */
export function decideRecordDemandObservation(
  command: RecordDemandObservationCommand,
  recordedAt: IsoInstant,
  correctionTargetExists: boolean,
): DomainResult<{ observation: DemandObservationDto; audit: AuditDraft }> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "DEMAND_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A correction demand observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "DEMAND_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction demand observation may link to an earlier observation.",
    );
  }
  if (payload.caseKind === "correction" && !correctionTargetExists) {
    return err(
      "DEMAND_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The demand observation being corrected was not found in this workspace.",
    );
  }

  const observation: DemandObservationDto = {
    id: payload.demandObservationId,
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
      aggregateType: "demand_observation",
      aggregateId: observation.id,
      action: "demand_observation.recorded",
      transactionTime: observation.transactionTime,
      recordedAt,
      before: null,
      after: {
        kind: observation.kind,
        caseKind: observation.caseKind,
        relatedObservationId: observation.relatedObservationId,
        hasCustomer: observation.facts.customerId !== null,
        hasProduct: observation.facts.productId !== null,
        hasRequestedQuantity: observation.facts.requestedQuantity !== null,
        hasRequestedFor: observation.facts.requestedForAt !== null,
      },
      reason: observation.description,
    },
  });
}
