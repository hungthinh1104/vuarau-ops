import type { ReconciliationObservationDto } from "@vuarau/domain-contracts";
import type { reconciliationObservations } from "../../schema/index.ts";
import { toIso } from "../row-mappers.ts";

export function toReconciliationObservationDto(
  row: typeof reconciliationObservations.$inferSelect,
): ReconciliationObservationDto {
  return {
    id: row.id as ReconciliationObservationDto["id"],
    workspaceId: row.workspaceId as ReconciliationObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      expectedAmount:
        row.expectedAmountMinor === null || row.expectedAmountCurrency === null
          ? null
          : { amountMinor: row.expectedAmountMinor, currency: row.expectedAmountCurrency },
      observedAmount:
        row.observedAmountMinor === null || row.observedAmountCurrency === null
          ? null
          : { amountMinor: row.observedAmountMinor, currency: row.observedAmountCurrency },
      expectedQuantity:
        row.expectedQuantityScaled === null || row.expectedQuantityUnit === null
          ? null
          : { valueScaled: row.expectedQuantityScaled, unit: row.expectedQuantityUnit },
      observedQuantity:
        row.observedQuantityScaled === null || row.observedQuantityUnit === null
          ? null
          : { valueScaled: row.observedQuantityScaled, unit: row.observedQuantityUnit },
      itemCount: row.itemCount,
      productId: row.productId as ReconciliationObservationDto["facts"]["productId"],
      qualityGradeId: row.qualityGradeId as ReconciliationObservationDto["facts"]["qualityGradeId"],
      scopeReference: row.scopeReference,
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId:
      row.relatedObservationId as ReconciliationObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ReconciliationObservationDto["actorId"],
    commandId: row.commandId as ReconciliationObservationDto["commandId"],
  };
}
