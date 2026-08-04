import type { SupplierObservationDto, Unit } from "@vuarau/domain-contracts";
import type { supplierObservations } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

const quantity = (scaled: number | null, unit: Unit | null) =>
  scaled === null || unit === null ? null : { valueScaled: scaled, unit };

export function toSupplierObservationDto(
  row: typeof supplierObservations.$inferSelect,
): SupplierObservationDto {
  return {
    id: row.id as SupplierObservationDto["id"],
    workspaceId: row.workspaceId as SupplierObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      supplierId: row.supplierId as SupplierObservationDto["facts"]["supplierId"],
      productId: row.productId as SupplierObservationDto["facts"]["productId"],
      qualityGradeId: row.qualityGradeId as SupplierObservationDto["facts"]["qualityGradeId"],
      supplierObservationGroupId: row.supplierObservationGroupId,
      role: row.role,
      sourceArea: row.sourceArea,
      pickupResponsibility: row.pickupResponsibility,
      packingResponsibility: row.packingResponsibility,
      transportResponsibility: row.transportResponsibility,
      expectedLeadTimeText: row.expectedLeadTimeText,
      paymentArrangement: row.paymentArrangement,
      traceabilityLevel: row.traceabilityLevel,
      promisedQuantity: quantity(row.promisedQuantityScaled, row.promisedQuantityUnit),
      actualQuantity: quantity(row.actualQuantityScaled, row.actualQuantityUnit),
      acceptedQuantity: quantity(row.acceptedQuantityScaled, row.acceptedQuantityUnit),
      rejectedQuantity: quantity(row.rejectedQuantityScaled, row.rejectedQuantityUnit),
      expectedAt: toIsoOrNull(row.expectedAt),
      actualAt: toIsoOrNull(row.actualAt),
      price:
        row.priceMinor === null || row.priceCurrency === null
          ? null
          : { amountMinor: row.priceMinor, currency: row.priceCurrency },
      claimReference: row.claimReference,
      observationReference: row.observationReference,
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId:
      row.relatedObservationId as SupplierObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as SupplierObservationDto["actorId"],
    commandId: row.commandId as SupplierObservationDto["commandId"],
  };
}
