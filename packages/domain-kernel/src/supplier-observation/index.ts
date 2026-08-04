import type {
  IsoInstant,
  RecordSupplierObservationCommand,
  SupplierObservationDto,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

/** Supplier facts remain evidence only until a workspace policy is approved. */
export function decideRecordSupplierObservation(
  command: RecordSupplierObservationCommand,
  recordedAt: IsoInstant,
  correctionTarget: SupplierObservationDto | null,
  correctionTargetAlreadyCorrected: boolean,
): DomainResult<{ observation: SupplierObservationDto; audit: AuditDraft }> {
  const { payload } = command;
  if (payload.caseKind === "correction" && payload.relatedObservationId === null) {
    return err(
      "SUPPLIER_OBSERVATION_CORRECTION_TARGET_REQUIRED",
      "A supplier correction observation must identify the observation it corrects.",
    );
  }
  if (payload.caseKind !== "correction" && payload.relatedObservationId !== null) {
    return err(
      "SUPPLIER_OBSERVATION_CORRECTION_LINK_INVALID",
      "Only a correction observation may link to an earlier supplier observation.",
    );
  }
  if (payload.caseKind === "correction" && correctionTarget === null) {
    return err(
      "SUPPLIER_OBSERVATION_CORRECTION_TARGET_NOT_FOUND",
      "The supplier observation being corrected was not found in this workspace.",
    );
  }
  if (payload.caseKind === "correction" && correctionTargetAlreadyCorrected) {
    return err(
      "SUPPLIER_OBSERVATION_CORRECTION_TARGET_ALREADY_CORRECTED",
      "Only the current supplier observation chain tip may be corrected.",
    );
  }
  if (
    payload.caseKind === "correction" &&
    correctionTarget !== null &&
    (correctionTarget.kind !== payload.kind ||
      correctionTarget.facts.supplierId !== payload.facts.supplierId ||
      correctionTarget.facts.productId !== payload.facts.productId ||
      correctionTarget.facts.qualityGradeId !== payload.facts.qualityGradeId ||
      correctionTarget.facts.claimReference !== payload.facts.claimReference ||
      correctionTarget.facts.observationReference !== payload.facts.observationReference ||
      correctionTarget.facts.promisedQuantity?.unit !== payload.facts.promisedQuantity?.unit ||
      correctionTarget.facts.actualQuantity?.unit !== payload.facts.actualQuantity?.unit ||
      correctionTarget.facts.acceptedQuantity?.unit !== payload.facts.acceptedQuantity?.unit ||
      correctionTarget.facts.rejectedQuantity?.unit !== payload.facts.rejectedQuantity?.unit ||
      correctionTarget.facts.price?.currency !== payload.facts.price?.currency)
  ) {
    return err(
      "SUPPLIER_OBSERVATION_CORRECTION_IDENTITY_MISMATCH",
      "A supplier correction must preserve the supplier, product, grade, source, kind, unit and currency identity.",
    );
  }

  const observation: SupplierObservationDto = {
    id: payload.supplierObservationId,
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
      aggregateType: "supplier_observation",
      aggregateId: observation.id,
      action: "supplier_observation.recorded",
      transactionTime: observation.transactionTime,
      recordedAt,
      before: null,
      after: {
        kind: observation.kind,
        caseKind: observation.caseKind,
        relatedObservationId: observation.relatedObservationId,
        hasSupplier: observation.facts.supplierId !== null,
        hasProduct: observation.facts.productId !== null,
        hasQuantities:
          observation.facts.promisedQuantity !== null || observation.facts.actualQuantity !== null,
        hasTiming: observation.facts.expectedAt !== null || observation.facts.actualAt !== null,
      },
      reason: observation.description,
    },
  });
}
