import type {
  IsoInstant,
  RecordSupplyCommitmentObservationCommand,
  SupplyCommitmentObservationDto,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

/**
 * Supply commitment observations are source facts only. This decision never
 * creates a purchase, payable, receipt, inventory movement, reorder signal or
 * supplier evaluation result.
 */
export function decideRecordSupplyCommitmentObservation(
  command: RecordSupplyCommitmentObservationCommand,
  recordedAt: IsoInstant,
  correctionTarget: SupplyCommitmentObservationDto | null,
  correctionTargetAlreadyCorrected: boolean,
): DomainResult<{
  observation: SupplyCommitmentObservationDto;
  audit: AuditDraft;
}> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A correction observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction observation may link to an earlier observation.",
    );
  }
  if (payload.caseKind === "correction" && correctionTarget === null) {
    return err(
      "SUPPLY_COMMITMENT_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The observation being corrected was not found in this workspace.",
    );
  }
  if (payload.caseKind === "correction" && correctionTargetAlreadyCorrected) {
    return err(
      "SUPPLY_COMMITMENT_OBSERVATION_TARGET_ALREADY_CORRECTED",
      "Only the current supply commitment observation chain tip may be corrected.",
    );
  }
  if (
    payload.caseKind === "correction" &&
    correctionTarget !== null &&
    (correctionTarget.kind !== payload.kind ||
      correctionTarget.facts.supplierId !== payload.facts.supplierId ||
      correctionTarget.facts.productId !== payload.facts.productId ||
      correctionTarget.facts.qualityGradeId !== payload.facts.qualityGradeId ||
      correctionTarget.facts.commitmentReference !== payload.facts.commitmentReference ||
      correctionTarget.facts.promisedQuantity?.unit !== payload.facts.promisedQuantity?.unit ||
      correctionTarget.facts.minimumOrder?.unit !== payload.facts.minimumOrder?.unit)
  ) {
    return err(
      "SUPPLY_COMMITMENT_OBSERVATION_IDENTITY_MISMATCH",
      "A supply commitment correction must preserve the supplier, product, grade, source, kind and unit identity.",
    );
  }

  const observation: SupplyCommitmentObservationDto = {
    id: payload.supplyCommitmentObservationId,
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
      aggregateType: "supply_commitment_observation",
      aggregateId: observation.id,
      action: "supply_commitment_observation.recorded",
      transactionTime: observation.transactionTime,
      recordedAt,
      before: null,
      after: {
        kind: observation.kind,
        caseKind: observation.caseKind,
        relatedObservationId: observation.relatedObservationId,
        hasSupplier: observation.facts.supplierId !== null,
        hasProduct: observation.facts.productId !== null,
        hasPromisedQuantity: observation.facts.promisedQuantity !== null,
        hasExpectedArrival: observation.facts.expectedArrivalAt !== null,
      },
      reason: observation.description,
    },
  });
}
