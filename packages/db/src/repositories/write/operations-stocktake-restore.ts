import type { WorkspaceBackupV18 } from "@vuarau/domain-contracts";
import { stocktakeCounts, stocktakeSessions } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";
import type { ScopedRow } from "./operations-payment-allocation.ts";

export async function restoreStocktakes(
  tx: Tx,
  payload: WorkspaceBackupV18["payload"],
  scoped: ScopedRow,
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.stocktakeSessions.length > 0) {
    await tx.insert(stocktakeSessions).values(
      payload.stocktakeSessions.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          asOf: date(row["asOf"]),
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
          varianceMovementIds: row["varianceMovementIds"] ?? [],
          evidenceReferences: row["evidenceReferences"] ?? [],
        };
      }) as unknown as (typeof stocktakeSessions.$inferInsert)[],
    );
  }
  if (payload.stocktakeCounts.length > 0) {
    await tx.insert(stocktakeCounts).values(
      payload.stocktakeCounts.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
          evidenceReferences: row["evidenceReferences"] ?? [],
        };
      }) as unknown as (typeof stocktakeCounts.$inferInsert)[],
    );
  }
}
