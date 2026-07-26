import type {
  CustomerDto,
  DeactivateCustomerCommand,
  UpdateCustomerCommand,
} from "@vuarau/domain-contracts";
import {
  deactivateCustomerCommandSchema,
  updateCustomerCommandSchema,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideDeactivateCustomer, decideUpdateCustomer, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { toCustomerDto } from "../shared/mappers.ts";

/**
 * UC-CUSTOMER-004 and UC-CUSTOMER-005.
 *
 * Two named commands, not one patch with an `isActive` field. They touch disjoint
 * columns, they need different permissions — `customer.update` is held by sales,
 * `customer.deactivate` by the owner alone — and collapsing them would put a
 * lifecycle flag inside a shape whose other fields are free text.
 *
 * Neither writes an account entry. Renaming somebody, or hiding them from new
 * sales, must never move what they owe (BR-ACCOUNT-002, BR-CUSTOMER-003).
 */
export function updateCustomer(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<CustomerDto>> {
  return runCommand<UpdateCustomerCommand, CustomerDto>({
    commandType: "UpdateCustomer",
    schema: updateCustomerCommandSchema,
    input,
    ctx,
    requiredPermission: "customer.update",
    execute: async ({ command, repos, recordedAt }) => {
      const customer = await repos.customers.findByIdForUpdate(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const decision = decideUpdateCustomer({ command, customer, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      // Belt and braces (ADR-0009): the domain compared versions against the row
      // we read, and this compares again at write time.
      const written = await repos.customers.update(decision.value.aggregate, customer.version);
      if (!written) {
        return err("CUSTOMER_VERSION_CONFLICT", "Customer was modified by someone else.", {
          customerId: customer.id,
          expectedVersion: command.expectedVersion,
          actualVersion: customer.version,
        });
      }

      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toCustomerDto(decision.value.aggregate));
    },
  });
}

export function deactivateCustomer(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<CustomerDto>> {
  return runCommand<DeactivateCustomerCommand, CustomerDto>({
    commandType: "DeactivateCustomer",
    schema: deactivateCustomerCommandSchema,
    input,
    ctx,
    requiredPermission: "customer.deactivate",
    execute: async ({ command, repos, recordedAt }) => {
      const customer = await repos.customers.findByIdForUpdate(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const decision = decideDeactivateCustomer({ command, customer, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const written = await repos.customers.update(decision.value.aggregate, customer.version);
      if (!written) {
        return err("CUSTOMER_VERSION_CONFLICT", "Customer was modified by someone else.", {
          customerId: customer.id,
          expectedVersion: command.expectedVersion,
          actualVersion: customer.version,
        });
      }

      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toCustomerDto(decision.value.aggregate));
    },
  });
}
