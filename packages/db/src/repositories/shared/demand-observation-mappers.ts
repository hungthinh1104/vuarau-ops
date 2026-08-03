import type { DemandObservationDto, Unit } from "@vuarau/domain-contracts";
import type { demandObservations } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

export function toDemandObservationDto(
  row: typeof demandObservations.$inferSelect,
): DemandObservationDto {
  return {
    id: row.id as DemandObservationDto["id"],
    workspaceId: row.workspaceId as DemandObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      customerId: row.customerId as DemandObservationDto["facts"]["customerId"],
      productId: row.productId as DemandObservationDto["facts"]["productId"],
      qualityGradeId: row.qualityGradeId as DemandObservationDto["facts"]["qualityGradeId"],
      requestedQuantity:
        row.requestedQuantityScaled === null || row.requestedQuantityUnit === null
          ? null
          : {
              valueScaled: row.requestedQuantityScaled,
              unit: row.requestedQuantityUnit as Unit,
            },
      minimumQuantity:
        row.minimumQuantityScaled === null || row.minimumQuantityUnit === null
          ? null
          : {
              valueScaled: row.minimumQuantityScaled,
              unit: row.minimumQuantityUnit as Unit,
            },
      requestedForAt: toIsoOrNull(row.requestedForAt),
      counterpartyLabel: row.counterpartyLabel,
      demandReference: row.demandReference,
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId: row.relatedObservationId as DemandObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as DemandObservationDto["actorId"],
    commandId: row.commandId as DemandObservationDto["commandId"],
  };
}
