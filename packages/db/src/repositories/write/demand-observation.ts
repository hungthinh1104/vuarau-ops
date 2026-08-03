import type { DemandObservationDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { demandObservations } from "../../schema/index.ts";
import { toDemandObservationDto } from "../shared/demand-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createDemandObservationWriteRepositories = (tx: Tx) => ({
  demandObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(demandObservations)
        .where(
          and(
            eq(demandObservations.workspaceId, workspaceId),
            eq(demandObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDemandObservationDto(rows[0]);
    },
    async insert(observation: DemandObservationDto) {
      const rows = await tx
        .insert(demandObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          customerId: observation.facts.customerId,
          productId: observation.facts.productId,
          qualityGradeId: observation.facts.qualityGradeId,
          requestedQuantityScaled: observation.facts.requestedQuantity?.valueScaled ?? null,
          requestedQuantityUnit: observation.facts.requestedQuantity?.unit ?? null,
          minimumQuantityScaled: observation.facts.minimumQuantity?.valueScaled ?? null,
          minimumQuantityUnit: observation.facts.minimumQuantity?.unit ?? null,
          requestedForAt:
            observation.facts.requestedForAt === null
              ? null
              : new Date(observation.facts.requestedForAt),
          counterpartyLabel: observation.facts.counterpartyLabel,
          demandReference: observation.facts.demandReference,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: new Date(observation.transactionTime),
          recordedAt: new Date(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [demandObservations.workspaceId, demandObservations.id],
        })
        .returning({ id: demandObservations.id });
      return rows.length > 0;
    },
  },
});
