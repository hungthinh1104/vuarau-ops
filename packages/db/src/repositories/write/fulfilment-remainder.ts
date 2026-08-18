import type { FulfilmentRemainderCaseDto } from "@vuarau/domain-contracts";
import { aliasedTable, and, desc, eq, notExists } from "drizzle-orm";
import { fulfilmentRemainderCases } from "../../schema/index.ts";
import { fromIso, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

function toDto(row: typeof fulfilmentRemainderCases.$inferSelect): FulfilmentRemainderCaseDto {
  return {
    id: row.id as FulfilmentRemainderCaseDto["id"],
    workspaceId: row.workspaceId as FulfilmentRemainderCaseDto["workspaceId"],
    saleId: row.saleId as FulfilmentRemainderCaseDto["saleId"],
    caseKind: row.caseKind,
    outcome: row.outcome,
    reason: row.reason,
    relatedCaseId: row.relatedCaseId as FulfilmentRemainderCaseDto["relatedCaseId"],
    evidenceReferences: [...row.evidenceReferences],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as FulfilmentRemainderCaseDto["actorId"],
    commandId: row.commandId as FulfilmentRemainderCaseDto["commandId"],
  };
}

export const createFulfilmentRemainderWriteRepositories = (tx: Tx) => ({
  fulfilmentRemainderCases: {
    async findById(workspaceId: string, caseId: string) {
      const rows = await tx
        .select()
        .from(fulfilmentRemainderCases)
        .where(
          and(
            eq(fulfilmentRemainderCases.workspaceId, workspaceId),
            eq(fulfilmentRemainderCases.id, caseId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, caseId: string) {
      const rows = await tx
        .select()
        .from(fulfilmentRemainderCases)
        .where(
          and(
            eq(fulfilmentRemainderCases.workspaceId, workspaceId),
            eq(fulfilmentRemainderCases.id, caseId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async findLatestForSale(workspaceId: string, saleId: string) {
      const successor = aliasedTable(fulfilmentRemainderCases, "successor");
      const rows = await tx
        .select()
        .from(fulfilmentRemainderCases)
        .where(
          and(
            eq(fulfilmentRemainderCases.workspaceId, workspaceId),
            eq(fulfilmentRemainderCases.saleId, saleId),
            notExists(
              tx
                .select({ id: successor.id })
                .from(successor)
                .where(
                  and(
                    eq(successor.workspaceId, workspaceId),
                    eq(successor.relatedCaseId, fulfilmentRemainderCases.id),
                  ),
                ),
            ),
          ),
        )
        .orderBy(desc(fulfilmentRemainderCases.recordedAt), desc(fulfilmentRemainderCases.id))
        .limit(1);
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, caseId: string) {
      const rows = await tx
        .select()
        .from(fulfilmentRemainderCases)
        .where(
          and(
            eq(fulfilmentRemainderCases.workspaceId, workspaceId),
            eq(fulfilmentRemainderCases.relatedCaseId, caseId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async insert(remainderCase: FulfilmentRemainderCaseDto) {
      const rows = await tx
        .insert(fulfilmentRemainderCases)
        .values({
          id: remainderCase.id,
          workspaceId: remainderCase.workspaceId,
          saleId: remainderCase.saleId,
          caseKind: remainderCase.caseKind,
          outcome: remainderCase.outcome,
          reason: remainderCase.reason,
          relatedCaseId: remainderCase.relatedCaseId,
          evidenceReferences: [...remainderCase.evidenceReferences],
          transactionTime: fromIso(remainderCase.transactionTime),
          recordedAt: fromIso(remainderCase.recordedAt),
          actorId: remainderCase.actorId,
          commandId: remainderCase.commandId,
        })
        .onConflictDoNothing({
          target: [fulfilmentRemainderCases.workspaceId, fulfilmentRemainderCases.id],
        })
        .returning({ id: fulfilmentRemainderCases.id });
      return rows.length > 0;
    },
  },
});
