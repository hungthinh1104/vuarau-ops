import type { RebuildInventoryCommand, InventoryBalanceDto } from "@vuarau/domain-contracts";
import { rebuildInventoryCommandSchema } from "@vuarau/domain-contracts";
import { classifyInventory, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export const rebuildInventory = (ctx: CommandContext, input: unknown) =>
  runCommand<RebuildInventoryCommand, InventoryBalanceDto>({
    commandType: "RebuildInventory",
    schema: rebuildInventoryCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.rebuild",
    execute: async ({ command, repos, recordedAt }) => {
      if ((await repos.products.findById(command.workspaceId, command.payload.productId)) === null)
        return err("PRODUCT_NOT_FOUND", "No such Product.");
      const diagnostics = await repos.inventoryReads.integrity(
        command.workspaceId,
        command.payload.productId,
        command.payload.unit,
      );
      if (diagnostics.length > 0)
        return err(
          "INVENTORY_RECONCILIATION_INTEGRITY_FAILURE",
          "Canonical inventory movements are not safe to rebuild.",
          { diagnostics },
        );
      const movements = await repos.inventoryMovements.listByProduct(
        command.workspaceId,
        command.payload.productId,
        command.payload.unit,
      );
      const quantityScaled = movements.reduce(
        (total, movement) => total + movement.quantity.valueScaled,
        0,
      );
      const last = movements.reduce<null | typeof command.occurredAt>(
        (current, movement) =>
          current === null || movement.transactionTime > current
            ? movement.transactionTime
            : current,
        null,
      );
      await repos.inventoryBalances.save({
        workspaceId: command.workspaceId,
        productId: command.payload.productId,
        unit: command.payload.unit,
        quantityScaled,
        movementCount: movements.length,
        lastMovementTransactionTime: last,
        updatedAt: recordedAt,
      });
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "inventory",
        aggregateId: command.payload.productId,
        action: "inventory.projection_rebuilt",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { unit: command.payload.unit, movementCount: movements.length },
        reason: null,
      });
      return ok({
        workspaceId: command.workspaceId,
        productId: command.payload.productId,
        unit: command.payload.unit,
        quantityScaled,
        classification: classifyInventory(quantityScaled),
        movementCount: movements.length,
        lastMovementTransactionTime: last,
        updatedAt: recordedAt,
      });
    },
  });
