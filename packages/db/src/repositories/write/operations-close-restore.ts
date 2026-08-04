import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";
import {
  cashStatementMatches,
  cashStatementMatchReversals,
  operationalCloses,
  operationalCloseReopens,
} from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";
import type { ScopedRow } from "./operations-payment-allocation.ts";

export async function restoreCloseFacts(
  tx: Tx,
  payload: WorkspaceBackupV19["payload"],
  scoped: ScopedRow,
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.operationalCloses.length > 0) {
    await tx.insert(operationalCloses).values(
      payload.operationalCloses.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          supersedesOperationalCloseId: row["supersedesOperationalCloseId"] ?? null,
          version: row["version"] ?? 1,
          periodStart: date(
            row["periodStart"] ?? (row["period"] as Record<string, unknown>)?.["start"],
          ),
          periodEnd: date(row["periodEnd"] ?? (row["period"] as Record<string, unknown>)?.["end"]),
          observationIds: row["observationIds"] ?? [],
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof operationalCloses.$inferInsert)[],
    );
  }
  if (payload.operationalCloseReopens.length > 0) {
    await tx.insert(operationalCloseReopens).values(
      payload.operationalCloseReopens.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof operationalCloseReopens.$inferInsert)[],
    );
  }
  if (payload.cashStatementMatches.length > 0) {
    await tx.insert(cashStatementMatches).values(
      payload.cashStatementMatches.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          amountMinor:
            row["amountMinor"] ?? (row["amount"] as Record<string, unknown>)?.["amountMinor"],
          currency: row["currency"] ?? (row["amount"] as Record<string, unknown>)?.["currency"],
          evidenceReferences: row["evidenceReferences"] ?? [],
          statementAt: date(row["statementAt"]),
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof cashStatementMatches.$inferInsert)[],
    );
  }
  if (payload.cashStatementMatchReversals.length > 0) {
    await tx.insert(cashStatementMatchReversals).values(
      payload.cashStatementMatchReversals.map((raw) => {
        const row = scoped(raw);
        return {
          ...row,
          evidenceReferences: row["evidenceReferences"] ?? [],
          transactionTime: date(row["transactionTime"]),
          recordedAt: date(row["recordedAt"]),
        };
      }) as unknown as (typeof cashStatementMatchReversals.$inferInsert)[],
    );
  }
}
