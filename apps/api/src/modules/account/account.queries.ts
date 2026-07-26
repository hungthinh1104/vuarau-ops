import type {
  AccountTimelineEntryDto,
  AccountTimelineInput,
  CurrencyCode,
  CustomerAccountBalanceDto,
  CustomerId,
  Page,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import { DEFAULT_CURRENCY } from "@vuarau/domain-contracts";
import type { CustomerAccountBalance, DomainResult } from "@vuarau/domain-kernel";
import { classifyBalance, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { authorizeWorkspaceAccess, accountCapabilities } from "../shared/authorization.ts";
import { emptyAccountBalance, rebuildCustomerAccountBalance } from "../shared/account-effects.ts";
import { toAccountBalanceDto } from "../shared/mappers.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

/**
 * Reads. Plain queries, not commands — only the write side is command-shaped
 * (ADR-0002).
 *
 * They are authorized exactly like commands, through the same
 * `authorizeWorkspaceAccess`. Before Milestone 1 these took a `workspaceId` and
 * returned whatever it named, so any caller could read any depot's account book —
 * workspace isolation had been enforced on the write path only.
 */

export async function getCustomerAccountBalance(
  ctx: CommandContext,
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<DomainResult<CustomerAccountBalanceDto>> {
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

    const stored = await repos.accountBalances.get(workspaceId, customerId);
    // A customer with no entries has no balance row. Their balance is zero
    // because nothing has moved it, and this reports that without writing a row.
    const balance: CustomerAccountBalance =
      stored ?? emptyAccountBalance(workspaceId, customerId, currency, ctx.deps.clock.now());

    return ok(toAccountBalanceDto(balance, accountCapabilities(authorized.value.role)));
  });
}

/**
 * BR-ACCOUNT-006 — the operational recovery procedure for a drifted projection
 * (CASE-ACCOUNT-007). Safe by construction: the entries are the truth and the
 * balance is disposable.
 *
 * Deliberately not exposed as a tRPC procedure. It is a maintenance operation an
 * operator runs, not something a UI should be able to trigger — so it takes no
 * principal and performs no permission check. Reaching it requires shell access
 * to the server, which is its own authorization boundary.
 */
export async function rebuildAccountBalance(
  deps: CommandContext["deps"],
  workspaceId: WorkspaceId,
  customerId: CustomerId,
  currency: CurrencyCode = DEFAULT_CURRENCY,
): Promise<CustomerAccountBalance> {
  return deps.uow.transaction((repos) =>
    rebuildCustomerAccountBalance(repos, workspaceId, customerId, currency, deps.clock.now()),
  );
}

/**
 * UC-ACCOUNT-001, the timeline half.
 *
 * The recovery surface: when a customer disputes a total, this list is the
 * answer. Every line names what moved the money, who did it, and what the balance
 * was afterwards — and every line stands, including the compensating pairs. A
 * voided sale appears as `+total` then `−total`, never as an absence, because
 * hiding either would make the arithmetic unfollowable (BR-ACCOUNT-005).
 */
export function getCustomerAccountTimeline(
  ctx: CommandContext,
  input: AccountTimelineInput,
): Promise<DomainResult<Page<AccountTimelineEntryDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "debt.read",
    execute: async ({ repos }) => {
      const result = await repos.accountReads.timeline({
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        from: input.from,
        to: input.to,
        page: toPageQuery(input),
      });

      return toPage(result, (row) => ({
        ...row,
        // Named per line, not only for the final balance: a timeline that shows a
        // running total crossing zero has to say which side of zero each line is.
        classification: classifyBalance(row.runningBalance),
      }));
    },
  });
}
