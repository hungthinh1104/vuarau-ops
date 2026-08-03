import type { WorkspaceBackupV17, WorkspaceId } from "@vuarau/domain-contracts";
import { paymentAllocationReversals, paymentAllocations } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export type ScopedRow = (row: Record<string, unknown>) => Record<string, unknown> & {
  workspaceId: WorkspaceId;
};

export function createBackupRowScope(workspaceId: WorkspaceId): ScopedRow {
  return (row) => ({ ...row, workspaceId });
}

export async function restorePaymentAllocationFacts(
  tx: Tx,
  payload: WorkspaceBackupV17["payload"],
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
}
