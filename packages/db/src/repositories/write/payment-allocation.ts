import { and, asc, eq } from "drizzle-orm";
import type {
  PaymentAllocationDto,
  PaymentAllocationReversalDto,
  PaymentAllocationId,
  PaymentAllocationReversalId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { paymentAllocationReversals, paymentAllocations } from "../../schema/index.ts";
import { fromIso, money, toIso } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

const toAllocation = (row: typeof paymentAllocations.$inferSelect): PaymentAllocationDto => ({
  id: row.id as PaymentAllocationId,
  workspaceId: row.workspaceId as PaymentAllocationDto["workspaceId"],
  customerId: row.customerId as PaymentAllocationDto["customerId"],
  paymentId: row.paymentId as PaymentAllocationDto["paymentId"],
  saleId: row.saleId as PaymentAllocationDto["saleId"],
  amount: money(row.amountMinor, row.currency),
  evidenceReferences: [...row.evidenceReferences],
  transactionTime: toIso(row.transactionTime),
  recordedAt: toIso(row.recordedAt),
  actorId: row.actorId as PaymentAllocationDto["actorId"],
  commandId: row.commandId as PaymentAllocationDto["commandId"],
});

const toReversal = (
  row: typeof paymentAllocationReversals.$inferSelect,
): PaymentAllocationReversalDto => ({
  id: row.id as PaymentAllocationReversalId,
  workspaceId: row.workspaceId as PaymentAllocationReversalDto["workspaceId"],
  customerId: row.customerId as PaymentAllocationReversalDto["customerId"],
  allocationId: row.allocationId as PaymentAllocationReversalDto["allocationId"],
  amount: money(row.amountMinor, row.currency),
  reason: row.reason,
  evidenceReferences: [...row.evidenceReferences],
  transactionTime: toIso(row.transactionTime),
  recordedAt: toIso(row.recordedAt),
  actorId: row.actorId as PaymentAllocationReversalDto["actorId"],
  commandId: row.commandId as PaymentAllocationReversalDto["commandId"],
});

export const createPaymentAllocationWriteRepositories = (tx: Tx) => ({
  paymentAllocations: {
    async findByIdForUpdate(workspaceId: WorkspaceId, allocationId: PaymentAllocationId) {
      const [row] = await tx
        .select()
        .from(paymentAllocations)
        .where(
          and(
            eq(paymentAllocations.workspaceId, workspaceId),
            eq(paymentAllocations.id, allocationId),
          ),
        )
        .limit(1)
        .for("update");
      return row === undefined ? null : toAllocation(row);
    },

    async listByCustomer(workspaceId: WorkspaceId, customerId: string) {
      const [allocationRows, reversalRows] = await Promise.all([
        tx
          .select()
          .from(paymentAllocations)
          .where(
            and(
              eq(paymentAllocations.workspaceId, workspaceId),
              eq(paymentAllocations.customerId, customerId),
            ),
          )
          .orderBy(asc(paymentAllocations.transactionTime), asc(paymentAllocations.id)),
        tx
          .select()
          .from(paymentAllocationReversals)
          .where(
            and(
              eq(paymentAllocationReversals.workspaceId, workspaceId),
              eq(paymentAllocationReversals.customerId, customerId),
            ),
          )
          .orderBy(
            asc(paymentAllocationReversals.transactionTime),
            asc(paymentAllocationReversals.id),
          ),
      ]);
      return {
        allocations: allocationRows.map(toAllocation),
        reversals: reversalRows.map(toReversal),
      };
    },

    async insert(allocation: PaymentAllocationDto): Promise<boolean> {
      const rows = await tx
        .insert(paymentAllocations)
        .values({
          id: allocation.id,
          workspaceId: allocation.workspaceId,
          customerId: allocation.customerId,
          paymentId: allocation.paymentId,
          saleId: allocation.saleId,
          amountMinor: allocation.amount.amountMinor,
          currency: allocation.amount.currency,
          evidenceReferences: [...allocation.evidenceReferences],
          transactionTime: fromIso(allocation.transactionTime),
          recordedAt: fromIso(allocation.recordedAt),
          actorId: allocation.actorId,
          commandId: allocation.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: paymentAllocations.id });
      return rows.length === 1;
    },

    async insertReversal(reversal: PaymentAllocationReversalDto): Promise<boolean> {
      const rows = await tx
        .insert(paymentAllocationReversals)
        .values({
          id: reversal.id,
          workspaceId: reversal.workspaceId,
          customerId: reversal.customerId,
          allocationId: reversal.allocationId,
          amountMinor: reversal.amount.amountMinor,
          currency: reversal.amount.currency,
          reason: reversal.reason,
          evidenceReferences: [...reversal.evidenceReferences],
          transactionTime: fromIso(reversal.transactionTime),
          recordedAt: fromIso(reversal.recordedAt),
          actorId: reversal.actorId,
          commandId: reversal.commandId,
        })
        .onConflictDoNothing()
        .returning({ id: paymentAllocationReversals.id });
      return rows.length === 1;
    },
  },
});
