import type { WorkspaceBackupV21 } from "@vuarau/domain-contracts";
import { fulfilmentRemainderCases } from "../../schema/index.ts";
import type { Tx } from "../shared/types.ts";
import type { ScopedRow } from "./operations-payment-allocation.ts";

export async function restoreFulfilmentRemainderCases(
  tx: Tx,
  payload: WorkspaceBackupV21["payload"],
  scoped: ScopedRow,
  date: (value: unknown) => Date,
): Promise<void> {
  if (payload.fulfilmentRemainderCases.length === 0) return;
  const rows = [...payload.fulfilmentRemainderCases]
    .sort(
      (left, right) =>
        (left["caseKind"] === "opened" ? 0 : left["caseKind"] === "decision" ? 1 : 2) -
        (right["caseKind"] === "opened" ? 0 : right["caseKind"] === "decision" ? 1 : 2),
    )
    .map((raw) => {
      const row = scoped(raw);
      return {
        ...row,
        evidenceReferences: row["evidenceReferences"] ?? [],
        transactionTime: date(row["transactionTime"]),
        recordedAt: date(row["recordedAt"]),
      };
    });
  await tx
    .insert(fulfilmentRemainderCases)
    .values(rows as unknown as (typeof fulfilmentRemainderCases.$inferInsert)[]);
}
