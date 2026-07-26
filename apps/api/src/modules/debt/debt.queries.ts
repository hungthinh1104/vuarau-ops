import type {
  CurrencyCode,
  CustomerDebtSummaryDto,
  CustomerId,
  DebtLedgerEntryDto,
  WorkspaceId,
} from "@vuanha/domain-contracts";
import { DEFAULT_CURRENCY } from "@vuanha/domain-contracts";
import type { CommandDeps } from "../shared/command-pipeline.ts";
import { emptyDebtSummary, rebuildCustomerDebtSummary } from "../shared/debt-effects.ts";

/**
 * Reads. Plain queries, not commands — only the write side is command-shaped
 * (ADR-0002).
 */

export async function getCustomerDebtSummary(
  deps: CommandDeps,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<CustomerDebtSummaryDto> {
  return deps.uow.transaction(async (repos) => {
    const stored = await repos.debtSummaries.get(workspaceId, customerId);
    // A customer with no entries has no summary row. Their balance is zero
    // because nothing has moved it, and this reports that without writing a row.
    return stored ?? emptyDebtSummary(workspaceId, customerId, currency, deps.clock.now());
  });
}

export async function listCustomerLedger(
  deps: CommandDeps,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
): Promise<readonly DebtLedgerEntryDto[]> {
  return deps.uow.transaction((repos) => repos.ledger.listByCustomer(workspaceId, customerId));
}

/**
 * BR-DEBT-006 — the operational recovery procedure for a drifted projection
 * (CASE-DEBT-007). Safe by construction: the entries are the truth and the
 * summary is disposable.
 *
 * Deliberately not exposed as a tRPC procedure. It is a maintenance operation an
 * operator runs, not something a UI should be able to trigger.
 */
export async function rebuildDebtSummary(
  deps: CommandDeps,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<CustomerDebtSummaryDto> {
  return deps.uow.transaction((repos) =>
    rebuildCustomerDebtSummary(repos, workspaceId, customerId, currency, deps.clock.now()),
  );
}
