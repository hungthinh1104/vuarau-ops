import type { DebtObservationDto } from "@vuarau/domain-contracts";
import type { debtObservations } from "../../schema/index.ts";
import { toIso, toIsoOrNull } from "../row-mappers.ts";

export function toDebtObservationDto(
  row: typeof debtObservations.$inferSelect,
): DebtObservationDto {
  return {
    id: row.id as DebtObservationDto["id"],
    workspaceId: row.workspaceId as DebtObservationDto["workspaceId"],
    kind: row.kind,
    caseKind: row.caseKind,
    description: row.description,
    participantWording: row.participantWording,
    facts: {
      amount:
        row.amountMinor === null || row.amountCurrency === null
          ? null
          : { amountMinor: row.amountMinor, currency: row.amountCurrency },
      agreedDueAt: toIsoOrNull(row.agreedDueAt),
      promiseToPayAt: toIsoOrNull(row.promiseToPayAt),
      termCode: row.termCode,
      termText: row.termText,
      paymentReference: row.paymentReference,
      allocationProposal: row.allocationProposal,
      customerId: row.customerId as DebtObservationDto["facts"]["customerId"],
    },
    evidenceReferences: [...row.evidenceReferences],
    relatedObservationId: row.relatedObservationId as DebtObservationDto["relatedObservationId"],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as DebtObservationDto["actorId"],
    commandId: row.commandId as DebtObservationDto["commandId"],
  };
}
