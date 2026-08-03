import { and, eq } from "drizzle-orm";
import type { PaymentId, WorkspaceId } from "@vuarau/domain-contracts";
import type { PaymentReversalState, PaymentState } from "@vuarau/domain-kernel";
import { paymentReversals, payments } from "../../schema/index.ts";
import { fromIso, toPaymentState } from "../row-mappers.ts";
import type { Tx } from "../shared/types.ts";

export const createPaymentWriteRepositories = (tx: Tx) => ({
  payments: {
    async findByIdForUpdate(
      workspaceId: WorkspaceId,
      paymentId: PaymentId,
    ): Promise<PaymentState | null> {
      const rows = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.workspaceId, workspaceId), eq(payments.id, paymentId)))
        .limit(1)
        .for("update");
      const row = rows[0];
      return row === undefined ? null : toPaymentState(row);
    },

    async insert(payment: PaymentState): Promise<void> {
      await tx.insert(payments).values({
        id: payment.id,
        workspaceId: payment.workspaceId,
        customerId: payment.customerId,
        amountMinor: payment.amount.amountMinor,
        currency: payment.amount.currency,
        method: payment.method,
        cashAccountId: payment.cashAccountId ?? null,
        payerName: payment.payerName,
        note: payment.note,
        evidenceReferences: [...payment.evidenceReferences],
        status: payment.status,
        reversedAmountMinor: payment.reversedAmount.amountMinor,
        version: payment.version,
        transactionTime: fromIso(payment.transactionTime),
        recordedAt: fromIso(payment.recordedAt),
      });
    },

    /** The only mutable columns on a payment, and `reversed` only ever grows. */
    async update(payment: PaymentState, expectedVersion: number): Promise<boolean> {
      const updated = await tx
        .update(payments)
        .set({
          status: payment.status,
          reversedAmountMinor: payment.reversedAmount.amountMinor,
          version: payment.version,
        })
        .where(
          and(
            eq(payments.workspaceId, payment.workspaceId),
            eq(payments.id, payment.id),
            eq(payments.version, expectedVersion),
          ),
        )
        .returning({ id: payments.id });
      return updated.length === 1;
    },

    async insertReversal(reversal: PaymentReversalState): Promise<void> {
      await tx.insert(paymentReversals).values({
        id: reversal.id,
        workspaceId: reversal.workspaceId,
        paymentId: reversal.paymentId,
        amountMinor: reversal.amount.amountMinor,
        currency: reversal.amount.currency,
        reason: reversal.reason,
        evidenceReferences: [...reversal.evidenceReferences],
        transactionTime: fromIso(reversal.transactionTime),
        recordedAt: fromIso(reversal.recordedAt),
      });
    },
  },
});
