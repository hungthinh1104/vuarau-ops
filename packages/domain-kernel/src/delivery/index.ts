import type {
  CancelDeliveryDraftCommand,
  CreateDeliveryDraftCommand,
  DispatchDeliveryCommand,
  IsoInstant,
  MarkDeliveryDeliveredCommand,
  RecordDeliveryReturnCommand,
  UpdateDeliveryDraftCommand,
} from "@vuarau/domain-contracts";
import type { DeliveryState, DeliveryReturnState, SaleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function deliveryLines(
  sale: SaleState,
  input: CreateDeliveryDraftCommand["payload"]["lines"],
  fulfilled: ReadonlyMap<string, number>,
): DomainResult<DeliveryState["lines"]> {
  const seen = new Set<string>();
  const lines: DeliveryState["lines"][number][] = [];
  for (const inputLine of input) {
    if (seen.has(inputLine.saleLineId))
      return err("DELIVERY_LINE_INVALID", "A Sale line may appear once in a Delivery.");
    seen.add(inputLine.saleLineId);
    const saleLine = sale.lines.find((line) => line.lineId === inputLine.saleLineId);
    if (saleLine === undefined)
      return err("DELIVERY_LINE_INVALID", "Delivery line does not belong to the Sale.");
    if (saleLine.productId === null)
      return err("DELIVERY_PRODUCT_REQUIRED", "Free-text Sale line cannot move inventory.");
    if (
      saleLine.productId !== inputLine.productId ||
      saleLine.quantity.unit !== inputLine.quantity.unit
    )
      return err("DELIVERY_LINE_INVALID", "Product and unit must match the Sale snapshot.");
    if (inputLine.quantity.valueScaled <= 0 || !Number.isInteger(inputLine.quantity.valueScaled))
      return err("DELIVERY_LINE_INVALID", "Delivery quantity must be positive.");
    const remaining = saleLine.quantity.valueScaled - (fulfilled.get(saleLine.lineId) ?? 0);
    if (inputLine.quantity.valueScaled > remaining)
      return err("DELIVERY_QUANTITY_EXCEEDS_SALE", "Dispatch would exceed Sale quantity.");
    lines.push({
      deliveryLineId: inputLine.deliveryLineId,
      saleLineId: saleLine.lineId,
      productId: saleLine.productId,
      productName: saleLine.productName,
      quantity: inputLine.quantity,
    });
  }
  return ok(lines);
}

export function decideCreateDeliveryDraft(args: {
  command: CreateDeliveryDraftCommand;
  sale: SaleState;
  fulfilled: ReadonlyMap<string, number>;
  predecessorHasFulfilment: boolean;
  recordedAt: IsoInstant;
}): DomainResult<DeliveryState> {
  if (args.sale.status !== "posted")
    return err("SALE_NOT_POSTED", "Delivery requires a posted Sale.");
  if (args.sale.replacesSaleId !== null && args.predecessorHasFulfilment)
    return err(
      "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED",
      "Replacement Sale cannot duplicate predecessor fulfilment.",
    );
  const lines = deliveryLines(args.sale, args.command.payload.lines, args.fulfilled);
  if (!lines.ok) return lines;
  return ok({
    id: args.command.payload.deliveryId,
    workspaceId: args.command.workspaceId,
    saleId: args.sale.id,
    status: "draft",
    lines: lines.value,
    note: args.command.payload.note?.trim() || null,
    cancellationReason: null,
    version: 1,
    transactionTime: args.command.occurredAt,
    recordedAt: args.recordedAt,
    dispatchedAt: null,
    deliveredAt: null,
    actorId: args.command.actorId,
    returns: [],
  });
}

export function decideUpdateDeliveryDraft(args: {
  current: DeliveryState;
  sale: SaleState;
  command: UpdateDeliveryDraftCommand;
  fulfilledExcludingCurrent: ReadonlyMap<string, number>;
  recordedAt: IsoInstant;
}): DomainResult<DeliveryState> {
  if (args.current.status !== "draft")
    return err("DELIVERY_ALREADY_DISPATCHED", "Only a Delivery draft can be edited.");
  if (args.current.version !== args.command.expectedVersion)
    return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
  const lines = deliveryLines(
    args.sale,
    args.command.payload.lines,
    args.fulfilledExcludingCurrent,
  );
  if (!lines.ok) return lines;
  return ok({
    ...args.current,
    lines: lines.value,
    note: args.command.payload.note?.trim() || null,
    version: args.current.version + 1,
    recordedAt: args.recordedAt,
  });
}

export function decideCancelDelivery(
  current: DeliveryState,
  command: CancelDeliveryDraftCommand,
  recordedAt: IsoInstant,
): DomainResult<DeliveryState> {
  if (current.status === "cancelled")
    return err("DELIVERY_ALREADY_CANCELLED", "Delivery is already cancelled.");
  if (current.status !== "draft")
    return err("DELIVERY_ALREADY_DISPATCHED", "A dispatched Delivery cannot be cancelled.");
  if (current.version !== command.expectedVersion)
    return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
  const reason = command.payload.reason.trim();
  if (reason.length === 0) return err("DELIVERY_REASON_REQUIRED", "Cancellation needs a reason.");
  return ok({
    ...current,
    status: "cancelled",
    cancellationReason: reason,
    version: current.version + 1,
    recordedAt,
  });
}

export function decideDispatchDelivery(
  current: DeliveryState,
  command: DispatchDeliveryCommand,
  recordedAt: IsoInstant,
): DomainResult<DeliveryState> {
  if (current.status === "cancelled")
    return err("DELIVERY_ALREADY_CANCELLED", "Cancelled Delivery cannot dispatch.");
  if (current.status !== "draft")
    return err("DELIVERY_ALREADY_DISPATCHED", "Delivery already left the depot.");
  if (current.version !== command.expectedVersion)
    return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
  return ok({
    ...current,
    status: "dispatched",
    version: current.version + 1,
    dispatchedAt: recordedAt,
    recordedAt,
  });
}

export function decideMarkDeliveryDelivered(
  current: DeliveryState,
  command: MarkDeliveryDeliveredCommand,
  recordedAt: IsoInstant,
): DomainResult<DeliveryState> {
  if (current.status === "delivered")
    return err("DELIVERY_ALREADY_DELIVERED", "Delivery is already delivered.");
  if (current.status !== "dispatched")
    return err("DELIVERY_ALREADY_DISPATCHED", "Only dispatched Delivery can be completed.");
  if (current.version !== command.expectedVersion)
    return err("DELIVERY_VERSION_CONFLICT", "Delivery changed on the server.");
  return ok({
    ...current,
    status: "delivered",
    version: current.version + 1,
    deliveredAt: recordedAt,
    recordedAt,
  });
}

export function decideRecordDeliveryReturn(
  current: DeliveryState,
  command: RecordDeliveryReturnCommand,
  recordedAt: IsoInstant,
): DomainResult<DeliveryReturnState> {
  if (current.status !== "dispatched" && current.status !== "delivered")
    return err("DELIVERY_NOT_FOUND", "Return requires a dispatched Delivery.");
  const reason = command.payload.reason.trim();
  if (reason.length === 0) return err("DELIVERY_REASON_REQUIRED", "Return needs a reason.");
  const lines: DeliveryReturnState["lines"][number][] = [];
  for (const inputLine of command.payload.lines) {
    const line = current.lines.find(
      (candidate) => candidate.deliveryLineId === inputLine.deliveryLineId,
    );
    if (
      line === undefined ||
      inputLine.quantity.unit !== line.quantity.unit ||
      inputLine.quantity.valueScaled <= 0
    )
      return err("DELIVERY_LINE_INVALID", "Return line does not match Delivery.");
    const returned = current.returns.reduce(
      (sum, record) =>
        sum +
        (record.lines.find((item) => item.deliveryLineId === line.deliveryLineId)?.quantity
          .valueScaled ?? 0),
      0,
    );
    if (returned + inputLine.quantity.valueScaled > line.quantity.valueScaled)
      return err("DELIVERY_RETURN_EXCEEDS_DISPATCH", "Return exceeds dispatched quantity.");
    lines.push({ deliveryLineId: line.deliveryLineId, quantity: inputLine.quantity });
  }
  return ok({
    id: command.payload.returnId,
    workspaceId: command.workspaceId,
    deliveryId: current.id,
    lines,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
  });
}
