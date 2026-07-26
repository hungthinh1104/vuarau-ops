import type { CreateCustomerCommand, CustomerDto } from "@vuanha/domain-contracts";
import { createCustomerCommandSchema } from "@vuanha/domain-contracts";
import type { DomainResult } from "@vuanha/domain-kernel";
import { decideCreateCustomer, ok } from "@vuanha/domain-kernel";
import type { CommandDeps } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { toCustomerDto } from "../shared/mappers.ts";

/** UC-CUSTOMER-001. Creates master data; writes no ledger entry. */
export function createCustomer(
  deps: CommandDeps,
  input: unknown,
): Promise<DomainResult<CustomerDto>> {
  return runCommand<CreateCustomerCommand, CustomerDto>({
    commandType: "CreateCustomer",
    schema: createCustomerCommandSchema,
    input,
    deps,
    execute: async ({ command, repos, recordedAt }) => {
      const decision = decideCreateCustomer({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const customer = decision.value.aggregate;
      await repos.customers.insert(customer);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toCustomerDto(customer));
    },
  });
}
