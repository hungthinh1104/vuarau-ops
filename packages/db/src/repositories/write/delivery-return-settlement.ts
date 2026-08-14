import type { DeliveryReturnSettlementDto } from "@vuarau/domain-contracts";
import { and, eq } from "drizzle-orm";
import { deliveryReturnSettlements } from "../../schema/index.ts";
import { fromIso, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

function toDto(row: typeof deliveryReturnSettlements.$inferSelect): DeliveryReturnSettlementDto {
  return {
    id: row.id as DeliveryReturnSettlementDto["id"],
    workspaceId: row.workspaceId as DeliveryReturnSettlementDto["workspaceId"],
    returnId: row.returnId as DeliveryReturnSettlementDto["returnId"],
    caseKind: row.caseKind,
    outcome: row.outcome,
    reason: row.reason,
    relatedSettlementId:
      row.relatedSettlementId as DeliveryReturnSettlementDto["relatedSettlementId"],
    evidenceReferences: [...row.evidenceReferences],
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as DeliveryReturnSettlementDto["actorId"],
    commandId: row.commandId as DeliveryReturnSettlementDto["commandId"],
  };
}

export const createDeliveryReturnSettlementWriteRepositories = (tx: Tx) => ({
  deliveryReturnSettlements: {
    async findById(workspaceId: string, settlementId: string) {
      const rows = await tx
        .select()
        .from(deliveryReturnSettlements)
        .where(
          and(
            eq(deliveryReturnSettlements.workspaceId, workspaceId),
            eq(deliveryReturnSettlements.id, settlementId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async findByIdForUpdate(workspaceId: string, settlementId: string) {
      const rows = await tx
        .select()
        .from(deliveryReturnSettlements)
        .where(
          and(
            eq(deliveryReturnSettlements.workspaceId, workspaceId),
            eq(deliveryReturnSettlements.id, settlementId),
          ),
        )
        .limit(1)
        .for("update");
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async findCorrectionByTarget(workspaceId: string, settlementId: string) {
      const rows = await tx
        .select()
        .from(deliveryReturnSettlements)
        .where(
          and(
            eq(deliveryReturnSettlements.workspaceId, workspaceId),
            eq(deliveryReturnSettlements.relatedSettlementId, settlementId),
          ),
        )
        .limit(1);
      return rows[0] === undefined ? null : toDto(rows[0]);
    },
    async existsForReturn(workspaceId: string, returnId: string) {
      const rows = await tx
        .select({ id: deliveryReturnSettlements.id })
        .from(deliveryReturnSettlements)
        .where(
          and(
            eq(deliveryReturnSettlements.workspaceId, workspaceId),
            eq(deliveryReturnSettlements.returnId, returnId),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async insert(settlement: DeliveryReturnSettlementDto) {
      const rows = await tx
        .insert(deliveryReturnSettlements)
        .values({
          id: settlement.id,
          workspaceId: settlement.workspaceId,
          returnId: settlement.returnId,
          caseKind: settlement.caseKind,
          outcome: settlement.outcome,
          reason: settlement.reason,
          relatedSettlementId: settlement.relatedSettlementId,
          evidenceReferences: [...settlement.evidenceReferences],
          transactionTime: fromIso(settlement.transactionTime),
          recordedAt: fromIso(settlement.recordedAt),
          actorId: settlement.actorId,
          commandId: settlement.commandId,
        })
        .onConflictDoNothing({
          target: [deliveryReturnSettlements.workspaceId, deliveryReturnSettlements.id],
        })
        .returning({ id: deliveryReturnSettlements.id });
      return rows.length > 0;
    },
  },
});
