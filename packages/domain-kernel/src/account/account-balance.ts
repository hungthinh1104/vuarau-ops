import type {
  BalanceClassification,
  CurrencyCode,
  CustomerAccountEntryDto,
  CustomerId,
  IsoInstant,
  Money,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CustomerAccountBalance } from "../shared/state.ts";
import { addMoney, zeroMoney } from "../shared/money.ts";

/**
 * BR-ACCOUNT-001 — the balance *is* this sum. Nothing else computes one.
 *
 * The same function serves the incremental path and the rebuild path
 * (BR-ACCOUNT-006), which is what makes "rebuild produces an identical answer"
 * true by construction rather than by discipline.
 */
export function calculateAccountBalance(
  entries: readonly CustomerAccountEntryDto[],
  currency: CurrencyCode,
): Money {
  return entries.reduce<Money>(
    (balance, entry) => addMoney(balance, entry.amount),
    zeroMoney(currency),
  );
}

/**
 * BR-ACCOUNT-009 — what the sign means, named.
 *
 * One function, called by every read. A client that decided this for itself would
 * be one `<` away from telling a worker to collect money from somebody the depot
 * owes.
 */
export function classifyBalance(balance: Money): BalanceClassification {
  if (balance.amountMinor > 0) {
    return "receivable";
  }
  if (balance.amountMinor < 0) {
    return "customer_credit";
  }
  return "settled";
}

export type BuildAccountBalanceInput = {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly entries: readonly CustomerAccountEntryDto[];
  readonly currency: CurrencyCode;
  readonly updatedAt: IsoInstant;
};

export function buildAccountBalance({
  workspaceId,
  customerId,
  entries,
  currency,
  updatedAt,
}: BuildAccountBalanceInput): CustomerAccountBalance {
  return {
    workspaceId,
    customerId,
    balance: calculateAccountBalance(entries, currency),
    entryCount: entries.length,
    // The *business* time of the most recent movement — what an aging report and
    // a "last activity" column both mean (docs/07-data/time-semantics.md).
    lastEntryTransactionTime: latestTransactionTime(entries),
    updatedAt,
  };
}

function latestTransactionTime(entries: readonly CustomerAccountEntryDto[]): IsoInstant | null {
  let latest: IsoInstant | null = null;
  for (const entry of entries) {
    if (latest === null || Date.parse(entry.transactionTime) > Date.parse(latest)) {
      latest = entry.transactionTime;
    }
  }
  return latest;
}
