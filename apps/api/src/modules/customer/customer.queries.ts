import type {
  CustomerCapabilities,
  CustomerDetailDto,
  CustomerSummaryDto,
  GetCustomerInput,
  Page,
  SearchCustomersInput,
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
 * Which customer commands this caller may attempt at all — the authority half of
 * a capability, computed from the same role table the guard uses (ADR-0011).
 *
 * `update` and `deactivate` are `COMMAND_NOT_AVAILABLE` until those commands
 * exist, so a UI greys them out from a server answer rather than from its own
 * idea of the roadmap.
 */
export function customerCapabilities(role: WorkspaceRole): CustomerCapabilities {
  return {
    update: roleHasPermission(role, "customer.update")
      ? denied("COMMAND_NOT_AVAILABLE", { command: "UpdateCustomer" })
      : denied("PERMISSION_DENIED", { permission: "customer.update", role }),
    deactivate: roleHasPermission(role, "customer.deactivate")
      ? denied("COMMAND_NOT_AVAILABLE", { command: "DeactivateCustomer" })
      : denied("PERMISSION_DENIED", { permission: "customer.deactivate", role }),
    adjustAccount: roleHasPermission(role, "debt.adjust")
      ? { allowed: true }
      : denied("PERMISSION_DENIED", { permission: "debt.adjust", role }),
  };
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
      const capabilities = customerCapabilities(membership.role);
      const result = await repos.customerReads.search({
        workspaceId: input.workspaceId,
        query: input.query,
        isActive: input.isActive,
        page: toPageQuery(input),
      });
      return toPage(result, (row) => ({ ...row, capabilities }));
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
        : { ...found, capabilities: customerCapabilities(membership.role) };
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
