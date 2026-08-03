import type { CostObservationDto } from "@vuarau/domain-contracts";
import { toIso } from "../row-mappers.ts";
import type { costObservations } from "../../schema/index.ts";

export function toCostObservationDto(
  row: typeof costObservations.$inferSelect,
): CostObservationDto {
  return {
    id: row.id as CostObservationDto["id"],
    workspaceId: row.workspaceId as CostObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      amount:
        row.amountMinor === null || row.amountCurrency === null
          ? null
          : { amountMinor: row.amountMinor, currency: row.amountCurrency },
      quantity:
        row.quantityScaled === null || row.quantityUnit === null
          ? null
          : { valueScaled: row.quantityScaled, unit: row.quantityUnit },
      productId: row.productId as CostObservationDto["facts"]["productId"],
      qualityGradeId: row.qualityGradeId as CostObservationDto["facts"]["qualityGradeId"],
      sourceReference: row.sourceReference,
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId: row.relatedObservationId as CostObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as CostObservationDto["actorId"],
    commandId: row.commandId as CostObservationDto["commandId"],
  };
}
