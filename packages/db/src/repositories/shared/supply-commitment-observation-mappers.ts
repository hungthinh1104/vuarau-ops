import type { SupplyCommitmentObservationDto } from "@vuarau/domain-contracts";
import type { supplyCommitmentObservations } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

export function toSupplyCommitmentObservationDto(
  row: typeof supplyCommitmentObservations.$inferSelect,
): SupplyCommitmentObservationDto {
  return {
    id: row.id as SupplyCommitmentObservationDto["id"],
    workspaceId: row.workspaceId as SupplyCommitmentObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      supplierId: row.supplierId as SupplyCommitmentObservationDto["facts"]["supplierId"],
      productId: row.productId as SupplyCommitmentObservationDto["facts"]["productId"],
      qualityGradeId:
        row.qualityGradeId as SupplyCommitmentObservationDto["facts"]["qualityGradeId"],
      promisedQuantity:
        row.promisedQuantityScaled === null || row.promisedQuantityUnit === null
          ? null
          : { valueScaled: row.promisedQuantityScaled, unit: row.promisedQuantityUnit },
      minimumOrder:
        row.minimumOrderScaled === null || row.minimumOrderUnit === null
          ? null
          : { valueScaled: row.minimumOrderScaled, unit: row.minimumOrderUnit },
      expectedArrivalAt: toIsoOrNull(row.expectedArrivalAt),
      counterpartyLabel: row.counterpartyLabel,
      commitmentReference: row.commitmentReference,
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId:
      row.relatedObservationId as SupplyCommitmentObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as SupplyCommitmentObservationDto["actorId"],
    commandId: row.commandId as SupplyCommitmentObservationDto["commandId"],
  };
}
