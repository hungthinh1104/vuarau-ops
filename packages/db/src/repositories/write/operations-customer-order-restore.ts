import type { WorkspaceBackupV17, WorkspaceId } from "@vuarau/domain-contracts";
import { customerOrderLines, customerOrders } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";

export async function restoreCustomerOrders(
  tx: Tx,
  workspaceId: WorkspaceId,
  payload: WorkspaceBackupV17["payload"],
  date: (value: unknown) => Date,
): Promise<void> {
  const scoped = (
    row: Record<string, unknown>,
  ): Record<string, unknown> & { workspaceId: WorkspaceId } => ({
    ...row,
    workspaceId,
  });
  if (payload.customerOrders.length > 0) {
    await tx.insert(customerOrders).values(
      payload.customerOrders.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          totalAmountMinor: row["totalAmountMinor"] ?? null,
          note: row["note"] ?? null,
          paymentTermsLabel: row["paymentTermsLabel"] ?? null,
          paymentTermsDueAt:
            row["paymentTermsDueAt"] == null ? null : date(row["paymentTermsDueAt"]),
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
          confirmedAt: row["confirmedAt"] == null ? null : date(row["confirmedAt"]),
          cancelledAt: row["cancelledAt"] == null ? null : date(row["cancelledAt"]),
          cancellationReason: row["cancellationReason"] ?? null,
          replacesCustomerOrderId: row["replacesCustomerOrderId"] ?? null,
        };
      }) as unknown as (typeof customerOrders.$inferInsert)[],
    );
  }
  if (payload.customerOrderLines.length > 0) {
    await tx
      .insert(customerOrderLines)
      .values(
        payload.customerOrderLines.map(
          scoped,
        ) as unknown as (typeof customerOrderLines.$inferInsert)[],
      );
  }
}
