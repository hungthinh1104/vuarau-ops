import type {
  CancelDeliveryDraftCommand,
  CreateDeliveryDraftCommand,
  DeliveryDto,
  DispatchDeliveryCommand,
  MarkDeliveryDeliveredCommand,
  RecordDeliveryReturnCommand,
  UpdateDeliveryDraftCommand,
} from "@vuarau/domain-contracts";
import {
  cancelDeliveryDraftCommandSchema,
  createDeliveryDraftCommandSchema,
  dispatchDeliveryCommandSchema,
  markDeliveryDeliveredCommandSchema,
  recordDeliveryReturnCommandSchema,
  updateDeliveryDraftCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideCancelDelivery,
  decideCreateDeliveryDraft,
  decideDispatchDelivery,
  decideMarkDeliveryDelivered,
  decideRecordDeliveryReturn,
  decideUpdateDeliveryDraft,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { DeliveryState } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyInventoryMovements } from "../inventory/inventory-effects.ts";

function dto(delivery: DeliveryState): DeliveryDto {
  return {
    ...delivery,
    lines: delivery.lines.map((line) => ({
      ...line,
      returnedQuantity: {
        valueScaled: delivery.returns
          .flatMap((record) => record.lines)
          .filter((item) => item.deliveryLineId === line.deliveryLineId)
          .reduce((sum, item) => sum + item.quantity.valueScaled, 0),
        unit: line.quantity.unit,
      },
    })),
    returns: delivery.returns.map((record) => ({
      id: record.id,
      reason: record.reason,
      lines: record.lines.map((line) => ({ ...line })),
      transactionTime: record.transactionTime,
      recordedAt: record.recordedAt,
      actorId: record.actorId,
    })),
  };
}

export function createDeliveryDraft(ctx: CommandContext, input: unknown) {
  return runCommand<CreateDeliveryDraftCommand, DeliveryDto>({
    commandType: "CreateDeliveryDraft",
    schema: createDeliveryDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.create",
    execute: async ({ command, repos, recordedAt }) => {
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) return err("SALE_NOT_FOUND", "No such Sale.");
      const fulfilled = await repos.deliveries.netFulfilledBySaleLine(
        command.workspaceId,
        sale.id,
        null,
      );
      let predecessorHasFulfilment = false;
      if (sale.replacesSaleId !== null) {
        const predecessor = await repos.deliveries.netFulfilledBySaleLine(
          command.workspaceId,
          sale.replacesSaleId,
          null,
        );
        predecessorHasFulfilment = [...predecessor.values()].some((value) => value > 0);
      }
      const decision = decideCreateDeliveryDraft({
        command,
        sale,
        fulfilled,
        predecessorHasFulfilment,
        recordedAt,
      });
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.insert(decision.value)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery identity already exists.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "delivery",
        aggregateId: decision.value.id,
        action: "delivery.draft_created",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { saleId: sale.id, lineCount: decision.value.lines.length },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function updateDeliveryDraft(ctx: CommandContext, input: unknown) {
  return runCommand<UpdateDeliveryDraftCommand, DeliveryDto>({
    commandType: "UpdateDeliveryDraft",
    schema: updateDeliveryDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.update",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.deliveries.findByIdForUpdate(
        command.workspaceId,
        command.payload.deliveryId,
      );
      if (current === null) return err("DELIVERY_NOT_FOUND", "No such Delivery.");
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, current.saleId);
      if (sale === null) return err("SALE_NOT_FOUND", "Delivery Sale is missing.");
      const fulfilled = await repos.deliveries.netFulfilledBySaleLine(
        command.workspaceId,
        sale.id,
        current.id,
      );
      const decision = decideUpdateDeliveryDraft({
        current,
        sale,
        command,
        fulfilledExcludingCurrent: fulfilled,
        recordedAt,
      });
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.update(decision.value, current.version, true)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "delivery",
        aggregateId: current.id,
        action: "delivery.draft_updated",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { version: current.version },
        after: { version: decision.value.version },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function cancelDeliveryDraft(ctx: CommandContext, input: unknown) {
  return runCommand<CancelDeliveryDraftCommand, DeliveryDto>({
    commandType: "CancelDeliveryDraft",
    schema: cancelDeliveryDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.cancel",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.deliveries.findByIdForUpdate(
        command.workspaceId,
        command.payload.deliveryId,
      );
      if (current === null) return err("DELIVERY_NOT_FOUND", "No such Delivery.");
      const decision = decideCancelDelivery(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.update(decision.value, current.version, false)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "delivery",
        aggregateId: current.id,
        action: "delivery.cancelled",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { status: current.status },
        after: { status: "cancelled" },
        reason: decision.value.cancellationReason,
      });
      return ok(dto(decision.value));
    },
  });
}

export function dispatchDelivery(ctx: CommandContext, input: unknown) {
  return runCommand<DispatchDeliveryCommand, DeliveryDto>({
    commandType: "DispatchDelivery",
    schema: dispatchDeliveryCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.dispatch",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.deliveries.findByIdForUpdate(
        command.workspaceId,
        command.payload.deliveryId,
      );
      if (current === null) return err("DELIVERY_NOT_FOUND", "No such Delivery.");
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, current.saleId);
      if (sale === null) return err("SALE_NOT_FOUND", "Delivery Sale is missing.");
      const fulfilled = await repos.deliveries.netFulfilledBySaleLine(
        command.workspaceId,
        sale.id,
        current.id,
      );
      for (const line of current.lines) {
        const saleLine = sale.lines.find((candidate) => candidate.lineId === line.saleLineId);
        if (
          saleLine === undefined ||
          (fulfilled.get(line.saleLineId) ?? 0) + line.quantity.valueScaled >
            saleLine.quantity.valueScaled
        )
          return err("DELIVERY_QUANTITY_EXCEEDS_SALE", "Dispatch exceeds Sale quantity.");
      }
      const decision = decideDispatchDelivery(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.update(decision.value, current.version, false)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
      await applyInventoryMovements(
        repos,
        current.lines.map((line) => ({
          workspaceId: command.workspaceId,
          productId: line.productId,
          quantity: {
            valueScaled: -line.quantity.valueScaled,
            unit: line.quantity.unit,
          },
          sourceType: "delivery_dispatch",
          sourceId: current.id,
          sourceLineId: line.deliveryLineId,
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
        aggregateType: "delivery",
        aggregateId: current.id,
        action: "delivery.dispatched",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { status: current.status },
        after: { status: "dispatched" },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function markDeliveryDelivered(ctx: CommandContext, input: unknown) {
  return runCommand<MarkDeliveryDeliveredCommand, DeliveryDto>({
    commandType: "MarkDeliveryDelivered",
    schema: markDeliveryDeliveredCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.complete",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.deliveries.findByIdForUpdate(
        command.workspaceId,
        command.payload.deliveryId,
      );
      if (current === null) return err("DELIVERY_NOT_FOUND", "No such Delivery.");
      const decision = decideMarkDeliveryDelivered(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.update(decision.value, current.version, false)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "delivery",
        aggregateId: current.id,
        action: "delivery.delivered",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { status: current.status },
        after: { status: "delivered" },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

export function recordDeliveryReturn(ctx: CommandContext, input: unknown) {
  return runCommand<RecordDeliveryReturnCommand, DeliveryDto>({
    commandType: "RecordDeliveryReturn",
    schema: recordDeliveryReturnCommandSchema,
    input,
    ctx,
    requiredPermission: "delivery.return",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.deliveries.findByIdForUpdate(
        command.workspaceId,
        command.payload.deliveryId,
      );
      if (current === null) return err("DELIVERY_NOT_FOUND", "No such Delivery.");
      const decision = decideRecordDeliveryReturn(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.deliveries.insertReturn(decision.value)))
        return err("DELIVERY_VERSION_CONFLICT", "Delivery return identity already exists.");
      const movements = await Promise.all(
        decision.value.lines.map(async (returnLine) => {
          const deliveryLine = current.lines.find(
            (line) => line.deliveryLineId === returnLine.deliveryLineId,
          )!;
          const inventory = await repos.inventoryMovements.listByProduct(
            command.workspaceId,
            deliveryLine.productId,
            deliveryLine.quantity.unit,
          );
          const original = inventory.find(
            (movement) =>
              movement.sourceType === "delivery_dispatch" &&
              movement.sourceId === current.id &&
              movement.sourceLineId === deliveryLine.deliveryLineId,
          );
          if (original === undefined)
            throw new Error(`Delivery ${current.id} is missing dispatch movement.`);
          return {
            workspaceId: command.workspaceId,
            productId: deliveryLine.productId,
            quantity: returnLine.quantity,
            sourceType: "delivery_return" as const,
            sourceId: decision.value.id,
            sourceLineId: deliveryLine.deliveryLineId,
            reversalOfMovementId: original.id,
            reasonCode: "customer_return",
            reason: decision.value.reason,
            transactionTime: command.occurredAt,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          };
        }),
      );
      await applyInventoryMovements(repos, movements);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "delivery",
        aggregateId: current.id,
        action: "delivery.returned",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { returnId: decision.value.id, lineCount: decision.value.lines.length },
        reason: decision.value.reason,
      });
      return ok(dto({ ...current, returns: [...current.returns, decision.value] }));
    },
  });
}
