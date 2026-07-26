import type { ConfirmOrderCommand, OrderDto } from "@vuanha/domain-contracts";
import { confirmOrderCommandSchema } from "@vuanha/domain-contracts";
import type { DomainResult } from "@vuanha/domain-kernel";
import { decideConfirmOrder, err, ok } from "@vuanha/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyLedgerEffects } from "../shared/debt-effects.ts";
import { toOrderDto } from "../shared/mappers.ts";

/**
 * UC-ORDER-001, second half — the moment a customer starts owing money.
 *
 * The order update, the ledger entry, the summary, the audit record and the
 * command receipt all commit together or not at all (BR-COMMAND-005).
 */
export function confirmOrder(ctx: CommandContext, input: unknown): Promise<DomainResult<OrderDto>> {
  return runCommand<ConfirmOrderCommand, OrderDto>({
    commandType: "ConfirmOrder",
    schema: confirmOrderCommandSchema,
    input,
    ctx,
    requiredPermission: "order.confirm",
    execute: async ({ command, repos, recordedAt }) => {
      const order = await repos.orders.findByIdForUpdate(
        command.workspaceId,
        command.payload.orderId,
      );
      if (order === null) {
        return err("ORDER_NOT_FOUND", "No such order in this workspace.", {
          orderId: command.payload.orderId,
        });
      }

      const decision = decideConfirmOrder({ command, order, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const confirmed = decision.value.aggregate;

      // Belt and braces (ADR-0009): the domain compared versions against the row we
      // read, and this compares again at write time. The row lock makes the race
      // unlikely; this makes a lost update impossible.
      const updated = await repos.orders.update(confirmed, order.version);
      if (!updated) {
        return err("ORDER_VERSION_CONFLICT", "Order was modified by someone else.", {
          orderId: order.id,
          expectedVersion: command.expectedVersion,
          actualVersion: order.version,
        });
      }

      await applyLedgerEffects(repos, decision.value.ledgerEntries, order.currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toOrderDto(confirmed));
    },
  });
}
