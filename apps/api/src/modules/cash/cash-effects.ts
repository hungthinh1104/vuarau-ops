import type { CashMovementDto } from "@vuarau/domain-contracts";
import type { CashMovementDraft } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

/** Append canonical money-location facts and advance disposable balances atomically. */
export async function applyCashMovements(
  repos: Repositories,
  drafts: readonly CashMovementDraft[],
): Promise<readonly CashMovementDto[]> {
  if (drafts.length === 0) return [];
  const appended = await repos.cashMovements.append(drafts);
  if (appended.length !== drafts.length) {
    throw new Error(
      `Cash movement source collision: expected ${drafts.length}, appended ${appended.length}.`,
    );
  }
  for (const movement of appended) {
    await repos.cashBalances.applyDelta({
      workspaceId: movement.workspaceId,
      cashAccountId: movement.cashAccountId,
      amount: movement.amount,
      movementCount: 1,
      lastMovementTransactionTime: movement.transactionTime,
      updatedAt: movement.recordedAt,
    });
  }
  return appended;
}
