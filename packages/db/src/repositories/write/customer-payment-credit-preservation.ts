import { and, asc, eq } from "drizzle-orm";
import type {
  CustomerPaymentCreditPreservationDto,
  CustomerPaymentCreditPreservationId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { customerPaymentCreditPreservations } from "../../schema/index.ts";
import { fromIso, money, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

const toPreservation = (
  row: typeof customerPaymentCreditPreservations.$inferSelect,
): CustomerPaymentCreditPreservationDto => ({
  id: row.id as CustomerPaymentCreditPreservationId,
  workspaceId: row.workspaceId as CustomerPaymentCreditPreservationDto["workspaceId"],
  paymentId: row.paymentId as CustomerPaymentCreditPreservationDto["paymentId"],
  customerId: row.customerId as CustomerPaymentCreditPreservationDto["customerId"],
  amount: money(row.amountMinor, row.currency),
  caseKind: row.caseKind as CustomerPaymentCreditPreservationDto["caseKind"],
  relatedPreservationId:
    row.relatedPreservationId as CustomerPaymentCreditPreservationDto["relatedPreservationId"],
  reason: row.reason,
  evidenceReferences: [...row.evidenceReferences],
  transactionTime: toIso(row.transactionTime),
  recordedAt: toIso(row.recordedAt),
  actorId: row.actorId as CustomerPaymentCreditPreservationDto["actorId"],
  commandId: row.commandId as CustomerPaymentCreditPreservationDto["commandId"],
});

export const createCustomerPaymentCreditPreservationWriteRepositories = (tx: Tx) => ({
  customerPaymentCreditPreservations: {
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      preservationId: CustomerPaymentCreditPreservationId,
    ) {
      const [row] = await tx
        .select()
        .from(customerPaymentCreditPreservations)
        .where(
          and(
            eq(customerPaymentCreditPreservations.workspaceId, workspaceId),
            eq(customerPaymentCreditPreservations.id, preservationId),
          ),
        )
        .limit(1)
        .for("update");
      return row === undefined ? null : toPreservation(row);
    },
    async findCorrectionByTarget(
      workspaceId: WorkspaceId,
      preservationId: CustomerPaymentCreditPreservationId,
    ) {
      const [row] = await tx
        .select()
        .from(customerPaymentCreditPreservations)
        .where(
          and(
            eq(customerPaymentCreditPreservations.workspaceId, workspaceId),
            eq(customerPaymentCreditPreservations.relatedPreservationId, preservationId),
          ),
        )
        .limit(1);
      return row === undefined ? null : toPreservation(row);
    },
    async listByPayment(workspaceId: WorkspaceId, paymentId: string) {
      const rows = await tx
        .select()
        .from(customerPaymentCreditPreservations)
        .where(
          and(
            eq(customerPaymentCreditPreservations.workspaceId, workspaceId),
            eq(customerPaymentCreditPreservations.paymentId, paymentId),
          ),
        )
        .orderBy(
          asc(customerPaymentCreditPreservations.transactionTime),
          asc(customerPaymentCreditPreservations.recordedAt),
          asc(customerPaymentCreditPreservations.id),
        );
      return rows.map(toPreservation);
    },
    async insert(preservation: CustomerPaymentCreditPreservationDto): Promise<boolean> {
      const rows = await tx
        .insert(customerPaymentCreditPreservations)
        .values({
          id: preservation.id,
          workspaceId: preservation.workspaceId,
          paymentId: preservation.paymentId,
          customerId: preservation.customerId,
          amountMinor: preservation.amount.amountMinor,
          currency: preservation.amount.currency,
          caseKind: preservation.caseKind,
          relatedPreservationId: preservation.relatedPreservationId,
          reason: preservation.reason,
          evidenceReferences: [...preservation.evidenceReferences],
          transactionTime: fromIso(preservation.transactionTime),
          recordedAt: fromIso(preservation.recordedAt),
          actorId: preservation.actorId,
          commandId: preservation.commandId,
        })
        .onConflictDoNothing({
          target: [
            customerPaymentCreditPreservations.workspaceId,
            customerPaymentCreditPreservations.id,
          ],
        })
        .returning({ id: customerPaymentCreditPreservations.id });
      return rows.length === 1;
    },
  },
});
