import type {
  CurrencyCode,
  CustomerId,
  CustomerAccountEntryDto,
  IsoInstant,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { CustomerAccountBalance, AccountEntryDraft } from "@vuarau/domain-kernel";
import { addMoney, buildAccountBalance, zeroMoney } from "@vuarau/domain-kernel";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";

/**
 * The single place ledger entries are written and the single place the debt
 * summary is touched (BR-ACCOUNT-002).
 *
 * Sale and Payment handlers *describe* an effect; only this function appends one.
 * That is what makes "debt changes only through ledger-producing commands"
 * enforceable rather than aspirational.
 */
export async function applyAccountEffects(
  repos: Repositories,
  drafts: readonly AccountEntryDraft[],
  currency: CurrencyCode,
): Promise<readonly CustomerAccountEntryDto[]> {
  if (drafts.length === 0) {
    return [];
  }

  const appended = await repos.accountEntries.append(drafts);

  // The projection moves in the same transaction as the entry that moved it, so
  // it is never stale in the way an asynchronous projection can be (ADR-0004).
  //
  // Grouped through a Map that keeps the ids as ids, rather than joining them
  // into a string and parsing them back out: no separator has to be chosen that
  // a uuid could never contain.
  const affected = new Map<string, { workspaceId: WorkspaceId; customerId: CustomerId }>();
  for (const entry of appended) {
    affected.set(`${entry.workspaceId}:${entry.customerId}`, {
      workspaceId: entry.workspaceId,
      customerId: entry.customerId,
    });
  }

  for (const { workspaceId, customerId } of affected.values()) {
    const entriesForCustomer = appended.filter(
      (entry) => entry.workspaceId === workspaceId && entry.customerId === customerId,
    );
    await advanceSummary(repos, workspaceId, customerId, entriesForCustomer, currency);
  }

  return appended;
}

/**
 * Incremental maintenance: add the new entries to the stored total rather than
 * re-summing a customer's whole history on every write.
 *
 * `rebuildCustomerAccountBalance` below recomputes from scratch and must produce an
 * identical answer (BR-ACCOUNT-006) — that equality is asserted by TC-ACCOUNT-002, which
 * is what keeps the fast path honest.
 */
async function advanceSummary(
  repos: Repositories,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  newEntries: readonly CustomerAccountEntryDto[],
  currency: CurrencyCode,
): Promise<void> {
  const current = await repos.accountBalances.get(workspaceId, customerId);

  let balance = current?.balance ?? zeroMoney(currency);
  let lastEntryTransactionTime = current?.lastEntryTransactionTime ?? null;

  for (const entry of newEntries) {
    balance = addMoney(balance, entry.amount);
    if (
      lastEntryTransactionTime === null ||
      Date.parse(entry.transactionTime) > Date.parse(lastEntryTransactionTime)
    ) {
      lastEntryTransactionTime = entry.transactionTime;
    }
  }

  const updatedAt = newEntries[newEntries.length - 1]!.recordedAt;

  await repos.accountBalances.save({
    workspaceId,
    customerId,
    balance,
    entryCount: (current?.entryCount ?? 0) + newEntries.length,
    lastEntryTransactionTime,
    updatedAt,
  });
}

/**
 * BR-ACCOUNT-006 — discard the projection and recompute it from the entries.
 *
 * This is the recovery procedure for a summary that has drifted (CASE-ACCOUNT-007),
 * and it is safe by construction: the entries are the truth and the summary is
 * disposable.
 */
export async function rebuildCustomerAccountBalance(
  repos: Repositories,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode,
  updatedAt: IsoInstant,
): Promise<CustomerAccountBalance> {
  const entries = await repos.accountEntries.listByCustomer(workspaceId, customerId);
  const summary = buildAccountBalance({ workspaceId, customerId, entries, currency, updatedAt });
  await repos.accountBalances.save(summary);
  return summary;
}

export function emptyAccountBalance(
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode,
  updatedAt: IsoInstant,
): CustomerAccountBalance {
  return {
    workspaceId,
    customerId,
    balance: zeroMoney(currency),
    entryCount: 0,
    lastEntryTransactionTime: null,
    updatedAt,
  };
}
