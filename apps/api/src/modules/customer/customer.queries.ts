import type {
  Capability,
  CustomerCapabilities,
  CustomerDetailDto,
  CustomerSummaryDto,
  GetCustomerInput,
  Page,
  Permission,
  SearchCustomersInput,
  RecentCustomersInput,
  RecentCustomerDto,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { denied, roleHasPermission } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

/**
 * UC-CUSTOMER-002 and UC-CUSTOMER-003.
 *
 * Both carry the account balance, because "who is this and what do they owe" is
 * one question in a depot. Answering it in two round trips lets the name and the
 * number disagree on screen, which is the state a worker acts on.
 */

/**
 * Which customer commands this caller may attempt — the authority half of a
 * capability, computed from the same role table the guard uses (ADR-0011).
 *
 * There is no state half: a customer is always editable, and always deactivatable
 * unless already inactive — and the second is a fact about the customer, added by
 * the caller that has one in hand.
 */
export function customerCapabilities(
  role: WorkspaceRole,
  customer?: { isActive: boolean },
): CustomerCapabilities {
  const permitted = (permission: Permission): Capability =>
    roleHasPermission(role, permission)
      ? { allowed: true }
      : denied("PERMISSION_DENIED", { permission, role });

  const deactivate = permitted("customer.deactivate");
  return {
    update: permitted("customer.update"),
    deactivate:
      deactivate.allowed && customer?.isActive === false
        ? denied("CUSTOMER_ALREADY_INACTIVE", {})
        : deactivate,
    adjustAccount: permitted("debt.adjust"),
  };
}

/** Active customers ordered by their own latest active posted sale, never payment. */
export function recentCustomers(
  ctx: CommandContext,
  input: RecentCustomersInput,
): Promise<DomainResult<readonly RecentCustomerDto[]>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "customer.read",
    execute: ({ repos }) => repos.customerReads.recent(input.workspaceId, input.limit),
  });
}

export function searchCustomers(
  ctx: CommandContext,
  input: SearchCustomersInput,
): Promise<DomainResult<Page<CustomerSummaryDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "customer.read",
    execute: async ({ repos, membership }) => {
      const result = await repos.customerReads.search({
        workspaceId: input.workspaceId,
        query: input.query,
        isActive: input.isActive,
        page: toPageQuery(input),
      });
      return toPage(result, (row) => ({
        ...row,
        capabilities: customerCapabilities(membership.role, row),
      }));
    },
  });
}

export async function getCustomer(
  ctx: CommandContext,
  input: GetCustomerInput,
): Promise<DomainResult<CustomerDetailDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "customer.read",
    execute: async ({ repos, membership }) => {
      const found = await repos.customerReads.get(input.workspaceId, input.customerId);
      return found === null
        ? null
        : { ...found, capabilities: customerCapabilities(membership.role, found.customer) };
    },
  });

  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    // Indistinguishable from a customer in another workspace, deliberately: a
    // different answer would confirm that an id exists somewhere (BR-CUSTOMER-002).
    return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
      customerId: input.customerId,
    });
  }
  return { ok: true, value: result.value };
}
