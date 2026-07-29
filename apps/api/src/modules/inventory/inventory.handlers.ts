import type {
  AdjustInventoryCommand,
  PurchaseReceiptDto,
  RecordPurchaseReceiptCommand,
  ReversePurchaseReceiptCommand,
} from "@vuarau/domain-contracts";
import {
  adjustInventoryCommandSchema,
  recordPurchaseReceiptCommandSchema,
  reversePurchaseReceiptCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideRecordPurchaseReceipt,
  decideReversePurchaseReceipt,
  err,
  ok,
  validateInventoryAdjustment,
} from "@vuarau/domain-kernel";
import type { PurchaseReceiptState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyInventoryMovements } from "./inventory-effects.ts";

const dto = (receipt: PurchaseReceiptState): PurchaseReceiptDto => ({
  ...receipt,
  lines: receipt.lines.map((line) => ({ ...line })),
  reversal:
    receipt.reversal === null
      ? null
      : {
          id: receipt.reversal.id,
          reasonCode: receipt.reversal.reasonCode,
          reason: receipt.reversal.reason,
          transactionTime: receipt.reversal.transactionTime,
          recordedAt: receipt.reversal.recordedAt,
        },
});

export function recordPurchaseReceipt(ctx: CommandContext, input: unknown) {
  return runCommand<RecordPurchaseReceiptCommand, PurchaseReceiptDto>({
    commandType: "RecordPurchaseReceipt",
    schema: recordPurchaseReceiptCommandSchema,
    input,
    ctx,
    requiredPermission: "receiving.record",
    execute: async ({ command, repos, recordedAt }) => {
      const purchase = await repos.purchases.findByIdForUpdate(
        command.workspaceId,
        command.payload.purchaseId,
      );
      if (purchase === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
      const net = await repos.purchaseReceipts.netReceivedByPurchaseLine(
        command.workspaceId,
        purchase.id,
      );
      const decision = decideRecordPurchaseReceipt({
        command,
        purchase,
        existingNetByLine: net,
        recordedAt,
      });
      if (!decision.ok) return decision;
      await repos.purchaseReceipts.insert(decision.value);
      await applyInventoryMovements(
        repos,
        decision.value.lines.map((line) => ({
          workspaceId: command.workspaceId,
          productId: line.productId,
          quantity: line.quantity,
          sourceType: "purchase_receipt",
          sourceId: decision.value.id,
          sourceLineId: line.receiptLineId,
          reversalOfMovementId: null,
          reasonCode: null,
          reason: null,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "receipt",
        aggregateId: decision.value.id,
        action: "receipt.recorded",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { lineCount: decision.value.lines.length },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function reversePurchaseReceipt(ctx: CommandContext, input: unknown) {
  return runCommand<ReversePurchaseReceiptCommand, PurchaseReceiptDto>({
    commandType: "ReversePurchaseReceipt",
    schema: reversePurchaseReceiptCommandSchema,
    input,
    ctx,
    requiredPermission: "receiving.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const receipt = await repos.purchaseReceipts.findById(
        command.workspaceId,
        command.payload.receiptId,
      );
      if (receipt === null) return err("RECEIPT_NOT_FOUND", "No such Receipt.");
      const decision = decideReversePurchaseReceipt(receipt, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.purchaseReceipts.insertReversal(decision.value)))
        return err("RECEIPT_ALREADY_REVERSED", "Receipt is already reversed.");
      const originals = await Promise.all(
        receipt.lines.map(async (line) => {
          const movements = await repos.inventoryMovements.listByProduct(
            command.workspaceId,
            line.productId,
            line.quantity.unit,
          );
          return (
            movements.find(
              (movement) =>
                movement.sourceType === "purchase_receipt" &&
                movement.sourceId === receipt.id &&
                movement.sourceLineId === line.receiptLineId,
            ) ?? null
          );
        }),
      );
      if (originals.some((movement) => movement === null))
        throw new Error(`Receipt ${receipt.id} is missing an inventory movement.`);
      await applyInventoryMovements(
        repos,
        receipt.lines.map((line, index) => ({
          workspaceId: command.workspaceId,
          productId: line.productId,
          quantity: { valueScaled: -line.quantity.valueScaled, unit: line.quantity.unit },
          sourceType: "purchase_receipt_reversal",
          sourceId: decision.value.id,
          sourceLineId: line.receiptLineId,
          reversalOfMovementId: originals[index]!.id,
          reasonCode: decision.value.reasonCode,
          reason: decision.value.reason,
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        })),
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "receipt",
        aggregateId: receipt.id,
        action: "receipt.reversed",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { active: true },
        after: { active: false },
        reason: decision.value.reason,
      });
      return ok(dto({ ...receipt, reversal: decision.value }));
    },
  });
}

export function adjustInventory(ctx: CommandContext, input: unknown) {
  return runCommand<AdjustInventoryCommand, { adjustmentId: string }>({
    commandType: "AdjustInventory",
    schema: adjustInventoryCommandSchema,
    input,
    ctx,
    requiredPermission: "inventory.adjust",
    execute: async ({ command, repos, recordedAt }) => {
      if ((await repos.products.findById(command.workspaceId, command.payload.productId)) === null)
        return err("PRODUCT_NOT_FOUND", "No such Product.");
      const decision = validateInventoryAdjustment(command);
      if (!decision.ok) return decision;
      await applyInventoryMovements(repos, [
        {
          workspaceId: command.workspaceId,
          productId: command.payload.productId,
          quantity: { valueScaled: decision.value, unit: command.payload.quantity.unit },
          sourceType: "inventory_adjustment",
          sourceId: command.payload.adjustmentId,
          sourceLineId: null,
          reversalOfMovementId: null,
          reasonCode: command.payload.reasonCode,
          reason: command.payload.reason.trim(),
          transactionTime: command.occurredAt,
          recordedAt,
          actorId: command.actorId,
          commandId: command.commandId,
        },
      ]);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "inventory",
        aggregateId: command.payload.adjustmentId,
        action: "inventory.adjusted",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { direction: command.payload.direction },
        reason: command.payload.reason.trim(),
      });
      return ok({ adjustmentId: command.payload.adjustmentId });
    },
  });
}
