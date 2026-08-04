import type { SupplyCommitmentObservationDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { supplyCommitmentObservations } from "../../schema/index.ts";
import { toSupplyCommitmentObservationDto } from "../shared/supply-commitment-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createSupplyCommitmentObservationWriteRepositories = (tx: Tx) => ({
  supplyCommitmentObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplyCommitmentObservations)
        .where(
          and(
            eq(supplyCommitmentObservations.workspaceId, workspaceId),
            eq(supplyCommitmentObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplyCommitmentObservationDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplyCommitmentObservations)
        .where(
          and(
            eq(supplyCommitmentObservations.workspaceId, workspaceId),
            eq(supplyCommitmentObservations.id, observationId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toSupplyCommitmentObservationDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(supplyCommitmentObservations)
        .where(
          and(
            eq(supplyCommitmentObservations.workspaceId, workspaceId),
            eq(supplyCommitmentObservations.relatedObservationId, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toSupplyCommitmentObservationDto(rows[0]);
    },
    async insert(observation: SupplyCommitmentObservationDto) {
      const rows = await tx
        .insert(supplyCommitmentObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          supplierId: observation.facts.supplierId,
          productId: observation.facts.productId,
          qualityGradeId: observation.facts.qualityGradeId,
          promisedQuantityScaled: observation.facts.promisedQuantity?.valueScaled ?? null,
          promisedQuantityUnit: observation.facts.promisedQuantity?.unit ?? null,
          minimumOrderScaled: observation.facts.minimumOrder?.valueScaled ?? null,
          minimumOrderUnit: observation.facts.minimumOrder?.unit ?? null,
          expectedArrivalAt:
            observation.facts.expectedArrivalAt === null
              ? null
              : new Date(observation.facts.expectedArrivalAt),
          counterpartyLabel: observation.facts.counterpartyLabel,
          commitmentReference: observation.facts.commitmentReference,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: new Date(observation.transactionTime),
          recordedAt: new Date(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [supplyCommitmentObservations.workspaceId, supplyCommitmentObservations.id],
        })
        .returning({ id: supplyCommitmentObservations.id });
      return rows.length > 0;
    },
  },
});
