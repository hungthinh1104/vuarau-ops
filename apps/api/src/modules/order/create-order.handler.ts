import type { CreateOrderCommand, OrderDto } from "@vuarau/domain-contracts";
import { createOrderCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideCreateOrder, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { toOrderDto } from "../shared/mappers.ts";

/** UC-ORDER-001, first half. A draft moves no money (ASM-002). */
export function createOrder(ctx: CommandContext, input: unknown): Promise<DomainResult<OrderDto>> {
  return runCommand<CreateOrderCommand, OrderDto>({
    commandType: "CreateOrder",
    schema: createOrderCommandSchema,
    input,
    ctx,
    requiredPermission: "order.create",
    execute: async ({ command, repos, recordedAt }) => {
      // The customer must exist *in this workspace*. Knowing the id is not enough.
      const customer = await repos.customers.findById(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const decision = decideCreateOrder({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const order = decision.value.aggregate;
      await repos.orders.insert(order);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toOrderDto(order));
    },
  });
}
