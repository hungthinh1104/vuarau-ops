import type { SupplierObservationDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { supplierObservations } from "../../schema/index.ts";
import { toSupplierObservationDto } from "../shared/supplier-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplierObservationWriteRepositories = (tx: Tx) => ({
  supplierObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(
          and(
            eq(supplierObservations.workspaceId, workspaceId),
            eq(supplierObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplierObservationDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(
          and(
            eq(supplierObservations.workspaceId, workspaceId),
            eq(supplierObservations.id, observationId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toSupplierObservationDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplierObservations)
        .where(
          and(
            eq(supplierObservations.workspaceId, workspaceId),
            eq(supplierObservations.relatedObservationId, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplierObservationDto(rows[0]);
    },
    async insert(observation: SupplierObservationDto) {
      const facts = observation.facts;
      const rows = await tx
        .insert(supplierObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          supplierId: facts.supplierId,
          productId: facts.productId,
          qualityGradeId: facts.qualityGradeId,
          role: facts.role,
          sourceArea: facts.sourceArea,
          pickupResponsibility: facts.pickupResponsibility,
          packingResponsibility: facts.packingResponsibility,
          transportResponsibility: facts.transportResponsibility,
          expectedLeadTimeText: facts.expectedLeadTimeText,
          paymentArrangement: facts.paymentArrangement,
          traceabilityLevel: facts.traceabilityLevel,
          promisedQuantityScaled: facts.promisedQuantity?.valueScaled ?? null,
          promisedQuantityUnit: facts.promisedQuantity?.unit ?? null,
          actualQuantityScaled: facts.actualQuantity?.valueScaled ?? null,
          actualQuantityUnit: facts.actualQuantity?.unit ?? null,
          acceptedQuantityScaled: facts.acceptedQuantity?.valueScaled ?? null,
          acceptedQuantityUnit: facts.acceptedQuantity?.unit ?? null,
          rejectedQuantityScaled: facts.rejectedQuantity?.valueScaled ?? null,
          rejectedQuantityUnit: facts.rejectedQuantity?.unit ?? null,
          expectedAt: facts.expectedAt === null ? null : new Date(facts.expectedAt),
          actualAt: facts.actualAt === null ? null : new Date(facts.actualAt),
          priceMinor: facts.price?.amountMinor ?? null,
          priceCurrency: facts.price?.currency ?? null,
          claimReference: facts.claimReference,
          observationReference: facts.observationReference,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: new Date(observation.transactionTime),
          recordedAt: new Date(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [supplierObservations.workspaceId, supplierObservations.id],
        })
        .returning({ id: supplierObservations.id });
      return rows.length > 0;
    },
  },
});
