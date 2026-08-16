import type { WorkspaceBackupV23, WorkspaceId } from "@vuarau/domain-contracts";
import {
  customerPaymentCreditPreservations,
  paymentAllocationReversals,
  paymentAllocations,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export type ScopedRow = (row: Record<string, unknown>) => Record<string, unknown> & {
  workspaceId: WorkspaceId;
};

export function createBackupRowScope(workspaceId: WorkspaceId): ScopedRow {
  return (row) => ({ ...row, workspaceId });
}

export async function restorePaymentAllocationFacts(
  tx: Tx,
  payload: WorkspaceBackupV23["payload"],
  scoped: ScopedRow,
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.paymentAllocations.length > 0) {
    await tx.insert(paymentAllocations).values(
      payload.paymentAllocations.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof paymentAllocations.$inferInsert)[],
    );
  }
  if (payload.paymentAllocationReversals.length > 0) {
    await tx.insert(paymentAllocationReversals).values(
      payload.paymentAllocationReversals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof paymentAllocationReversals.$inferInsert)[],
    );
  }
  if (payload.customerPaymentCreditPreservations.length > 0) {
    await tx.insert(customerPaymentCreditPreservations).values(
      payload.customerPaymentCreditPreservations.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof customerPaymentCreditPreservations.$inferInsert)[],
    );
  }
}
