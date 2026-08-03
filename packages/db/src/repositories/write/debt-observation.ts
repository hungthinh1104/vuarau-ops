import type { DebtObservationDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { debtObservations } from "../../schema/index.ts";
import { toDebtObservationDto } from "../shared/debt-observation-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createDebtObservationWriteRepositories = (tx: Tx) => ({
  debtObservations: {
    async findById(workspaceId: string, observationId: string) {
      const rows = await tx
        .select()
        .from(debtObservations)
        .where(
          and(eq(debtObservations.workspaceId, workspaceId), eq(debtObservations.id, observationId)),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDebtObservationDto(rows[0]);
    },
    async insert(observation: DebtObservationDto) {
      const rows = await tx
        .insert(debtObservations)
        .values({
          id: observation.id,
          workspaceId: observation.workspaceId,
          kind: observation.kind,
          caseKind: observation.caseKind,
          description: observation.description,
          participantWording: observation.participantWording,
          amountMinor: observation.facts.amount?.amountMinor ?? null,
          amountCurrency: observation.facts.amount?.currency ?? null,
          agreedDueAt:
            observation.facts.agreedDueAt === null ? null : new Date(observation.facts.agreedDueAt),
          promiseToPayAt:
            observation.facts.promiseToPayAt === null
              ? null
              : new Date(observation.facts.promiseToPayAt),
          termCode: observation.facts.termCode,
          termText: observation.facts.termText,
          paymentReference: observation.facts.paymentReference,
          allocationProposal: observation.facts.allocationProposal,
          customerId: observation.facts.customerId,
          evidenceReferences: [...observation.evidenceReferences],
          relatedObservationId: observation.relatedObservationId,
          transactionTime: new Date(observation.transactionTime),
          recordedAt: new Date(observation.recordedAt),
          actorId: observation.actorId,
          commandId: observation.commandId,
        })
        .onConflictDoNothing({
          target: [debtObservations.workspaceId, debtObservations.id],
        })
        .returning({ id: debtObservations.id });
      return rows.length > 0;
    },
  },
});
