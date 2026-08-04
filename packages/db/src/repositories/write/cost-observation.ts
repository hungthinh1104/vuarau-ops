import { and, eq } from "drizzle-orm";
import type { CostObservationDto } from "@vuarau/domain-contracts";
import { costObservations } from "../../schema/index.ts";
import { fromIso } from "../row-mappers.ts";
import { toCostObservationDto } from "../shared/cost-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createCostObservationWriteRepositories = (tx: Tx) => ({
  costObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(costObservations)
        .where(
          and(
            eq(costObservations.workspaceId, workspaceId),
            eq(costObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toCostObservationDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(costObservations)
        .where(
          and(
            eq(costObservations.workspaceId, workspaceId),
            eq(costObservations.id, observationId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toCostObservationDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(costObservations)
        .where(
          and(
            eq(costObservations.workspaceId, workspaceId),
            eq(costObservations.relatedObservationId, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toCostObservationDto(rows[0]);
    },
    async insert(observation: CostObservationDto) {
      const result = await tx
        .insert(costObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          amountMinor: observation.facts.amount?.amountMinor ?? null,
          amountCurrency: observation.facts.amount?.currency ?? null,
          quantityScaled: observation.facts.quantity?.valueScaled ?? null,
          quantityUnit: observation.facts.quantity?.unit ?? null,
          productId: observation.facts.productId,
          qualityGradeId: observation.facts.qualityGradeId,
          sourceReference: observation.facts.sourceReference,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: fromIso(observation.transactionTime),
          recordedAt: fromIso(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [costObservations.workspaceId, costObservations.id],
        })
        .returning({ id: costObservations.id });
      return result.length === 1;
    },
  },
});
