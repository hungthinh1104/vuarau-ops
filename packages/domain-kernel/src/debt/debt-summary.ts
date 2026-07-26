import type {
  CurrencyCode,
  CustomerId,
  DebtLedgerEntryDto,
  IsoInstant,
  Money,
  WorkspaceId,
} from "@vuanha/domain-contracts";
import type { CustomerDebtSummary } from "../shared/state.ts";
import { addMoney, zeroMoney } from "../shared/money.ts";

/**
 * BR-DEBT-001 — the balance *is* this sum. Nothing else computes one.
 *
 * The same function serves the incremental path and the rebuild path
 * (BR-DEBT-006), which is what makes "rebuild produces an identical answer"
 * true by construction rather than by discipline.
 */
export function calculateDebtBalance(
  entries: readonly DebtLedgerEntryDto[],
  currency: CurrencyCode,
): Money {
  return entries.reduce<Money>(
    (balance, entry) => addMoney(balance, entry.amount),
    zeroMoney(currency),
  );
}

export type BuildDebtSummaryInput = {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly entries: readonly DebtLedgerEntryDto[];
  readonly currency: CurrencyCode;
  readonly updatedAt: IsoInstant;
};

export function buildDebtSummary({
  workspaceId,
  customerId,
  entries,
  currency,
  updatedAt,
}: BuildDebtSummaryInput): CustomerDebtSummary {
  return {
    workspaceId,
    customerId,
    balance: calculateDebtBalance(entries, currency),
    entryCount: entries.length,
    // The *business* time of the most recent movement — what an aging report and
    // a "last activity" column both mean (docs/07-data/time-semantics.md).
    lastEntryTransactionTime: latestTransactionTime(entries),
    updatedAt,
  };
}

function latestTransactionTime(entries: readonly DebtLedgerEntryDto[]): IsoInstant | null {
  let latest: IsoInstant | null = null;
  for (const entry of entries) {
    if (latest === null || Date.parse(entry.transactionTime) > Date.parse(latest)) {
      latest = entry.transactionTime;
    }
  }
  return latest;
}
