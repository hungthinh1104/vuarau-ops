import type {
  CurrencyCode,
  CustomerDebtSummaryDto,
  CustomerId,
  DebtLedgerEntryDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { DEFAULT_CURRENCY } from "@vuarau/domain-contracts";
import type { CustomerDebtSummary, DomainResult } from "@vuarau/domain-kernel";
import { ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { authorizeWorkspaceAccess, debtCapabilities } from "../shared/authorization.ts";
import { emptyDebtSummary, rebuildCustomerDebtSummary } from "../shared/debt-effects.ts";
import { toDebtSummaryDto } from "../shared/mappers.ts";

/**
 * Reads. Plain queries, not commands — only the write side is command-shaped
 * (ADR-0002).
 *
 * They are authorized exactly like commands, through the same
 * `authorizeWorkspaceAccess`. Before Milestone 1 these took a `workspaceId` and
 * returned whatever it named, so any caller could read any depot's debt book —
 * workspace isolation had been enforced on the write path only.
 */

export async function getCustomerDebtSummary(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<DomainResult<CustomerDebtSummaryDto>> {
  return ctx.deps.uow.transaction(async (repos) => {
    const authorized = await authorizeWorkspaceAccess({
      repos,
      principal: ctx.principal,
      workspaceId,
      permission: "debt.read",
    });
    if (!authorized.ok) {
      return authorized;
    }

    const stored = await repos.debtSummaries.get(workspaceId, customerId);
    // A customer with no entries has no summary row. Their balance is zero
    // because nothing has moved it, and this reports that without writing a row.
    const summary: CustomerDebtSummary =
      stored ?? emptyDebtSummary(workspaceId, customerId, currency, ctx.deps.clock.now());

    return ok(toDebtSummaryDto(summary, debtCapabilities(authorized.value.role)));
  });
}

export async function listCustomerLedger(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
): Promise<DomainResult<readonly DebtLedgerEntryDto[]>> {
  return ctx.deps.uow.transaction(async (repos) => {
    const authorized = await authorizeWorkspaceAccess({
      repos,
      principal: ctx.principal,
      workspaceId,
      permission: "debt.read",
    });
    if (!authorized.ok) {
      return authorized;
    }

    return ok(await repos.ledger.listByCustomer(workspaceId, customerId));
  });
}

/**
 * BR-DEBT-006 — the operational recovery procedure for a drifted projection
 * (CASE-DEBT-007). Safe by construction: the entries are the truth and the
 * summary is disposable.
 *
 * Deliberately not exposed as a tRPC procedure. It is a maintenance operation an
 * operator runs, not something a UI should be able to trigger — so it takes no
 * principal and performs no permission check. Reaching it requires shell access
 * to the server, which is its own authorization boundary.
 */
export async function rebuildDebtSummary(
  deps: CommandContext["deps"],
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<CustomerDebtSummary> {
  return deps.uow.transaction((repos) =>
    rebuildCustomerDebtSummary(repos, workspaceId, customerId, currency, deps.clock.now()),
  );
}
