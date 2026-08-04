import type { ReconciliationObservationDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { reconciliationObservations } from "../../schema/index.ts";
import { toReconciliationObservationDto } from "../shared/reconciliation-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createReconciliationObservationWriteRepositories = (tx: Tx) => ({
  reconciliationObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(reconciliationObservations)
        .where(
          and(
            eq(reconciliationObservations.workspaceId, workspaceId),
            eq(reconciliationObservations.id, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toReconciliationObservationDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(reconciliationObservations)
        .where(
          and(
            eq(reconciliationObservations.workspaceId, workspaceId),
            eq(reconciliationObservations.id, observationId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toReconciliationObservationDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(reconciliationObservations)
        .where(
          and(
            eq(reconciliationObservations.workspaceId, workspaceId),
            eq(reconciliationObservations.relatedObservationId, observationId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toReconciliationObservationDto(rows[0]);
    },
    async insert(observation: ReconciliationObservationDto) {
      const rows = await tx
        .insert(reconciliationObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          expectedAmountMinor: observation.facts.expectedAmount?.amountMinor ?? null,
          expectedAmountCurrency: observation.facts.expectedAmount?.currency ?? null,
          observedAmountMinor: observation.facts.observedAmount?.amountMinor ?? null,
          observedAmountCurrency: observation.facts.observedAmount?.currency ?? null,
          expectedQuantityScaled: observation.facts.expectedQuantity?.valueScaled ?? null,
          expectedQuantityUnit: observation.facts.expectedQuantity?.unit ?? null,
          observedQuantityScaled: observation.facts.observedQuantity?.valueScaled ?? null,
          observedQuantityUnit: observation.facts.observedQuantity?.unit ?? null,
          itemCount: observation.facts.itemCount,
          productId: observation.facts.productId,
          qualityGradeId: observation.facts.qualityGradeId,
          scopeReference: observation.facts.scopeReference,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: new Date(observation.transactionTime),
          recordedAt: new Date(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [reconciliationObservations.workspaceId, reconciliationObservations.id],
        })
        .returning({ id: reconciliationObservations.id });
      return rows.length > 0;
    },
  },
});
