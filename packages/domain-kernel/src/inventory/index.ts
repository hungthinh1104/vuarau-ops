import type {
  AdjustInventoryCommand,
  IsoInstant,
  RecordPurchaseReceiptCommand,
  ReversePurchaseReceiptCommand,
} from "@vuarau/domain-contracts";
import type {
  PurchaseReceiptReversalState,
  PurchaseReceiptState,
  PurchaseState,
} from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export function decideRecordPurchaseReceipt(args: {
  command: RecordPurchaseReceiptCommand;
  purchase: PurchaseState;
  existingNetByLine: ReadonlyMap<string, number>;
  recordedAt: IsoInstant;
}): DomainResult<PurchaseReceiptState> {
  const { command, purchase, existingNetByLine, recordedAt } = args;
  if (purchase.status !== "confirmed" || purchase.voidRecord !== null)
    return err("PURCHASE_NOT_FOUND", "Receipt requires an active confirmed Purchase.");
  const pendingByLine = new Map(existingNetByLine);
  for (const line of command.payload.lines) {
    const purchased = purchase.lines.find((item) => item.lineId === line.purchaseLineId);
    if (purchased === undefined || purchased.productId !== line.productId)
      return err("PURCHASE_LINE_INVALID", "Receipt line does not match Purchase.");
    if (line.quantity.unit !== purchased.quantity.unit)
      return err("RECEIPT_UNIT_MISMATCH", "Receipt unit differs from Purchase.");
    if (line.quantity.valueScaled <= 0 || !Number.isInteger(line.quantity.valueScaled))
      return err("PURCHASE_LINE_INVALID", "Receipt quantity must be positive.");
    const existing = pendingByLine.get(line.purchaseLineId) ?? 0;
    if (existing + line.quantity.valueScaled > purchased.quantity.valueScaled)
      return err("RECEIPT_QUANTITY_EXCEEDS_PURCHASE", "Receipt exceeds Purchase quantity.");
    pendingByLine.set(line.purchaseLineId, existing + line.quantity.valueScaled);
  }
  return ok({
    id: command.payload.receiptId,
    workspaceId: command.workspaceId,
    purchaseId: purchase.id,
    lines: command.payload.lines.map((line) => ({ ...line })),
    note: command.payload.note?.trim() || null,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    reversal: null,
  });
}

export function decideReversePurchaseReceipt(
  receipt: PurchaseReceiptState,
  command: ReversePurchaseReceiptCommand,
  recordedAt: IsoInstant,
): DomainResult<PurchaseReceiptReversalState> {
  if (receipt.reversal !== null)
    return err("RECEIPT_ALREADY_REVERSED", "Receipt is already reversed.");
  const reason = command.payload.reason.trim();
  if (reason.length === 0)
    return err("RECEIPT_REVERSAL_REASON_REQUIRED", "Receipt reversal requires a reason.");
  return ok({
    id: command.payload.reversalId,
    workspaceId: command.workspaceId,
    receiptId: receipt.id,
    reasonCode: command.payload.reasonCode,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
  });
}

export function validateInventoryAdjustment(command: AdjustInventoryCommand): DomainResult<number> {
  if (command.payload.reason.trim().length === 0)
    return err("INVENTORY_ADJUSTMENT_REASON_REQUIRED", "Inventory adjustment needs a reason.");
  if (command.payload.quantity.valueScaled <= 0)
    return err("PURCHASE_LINE_INVALID", "Inventory adjustment quantity must be positive.");
  return ok(
    command.payload.direction === "increase"
      ? command.payload.quantity.valueScaled
      : -command.payload.quantity.valueScaled,
  );
}

export function validateInventoryReclassification(command: {
  payload: {
    fromQualityGradeId: string;
    toQualityGradeId: string;
    quantity: { valueScaled: number };
    reason: string;
  };
}): DomainResult<number> {
  if (command.payload.reason.trim().length === 0)
    return err(
      "INVENTORY_RECLASSIFICATION_REASON_REQUIRED",
      "Inventory reclassification needs a reason.",
    );
  if (
    command.payload.fromQualityGradeId === command.payload.toQualityGradeId ||
    !Number.isInteger(command.payload.quantity.valueScaled) ||
    command.payload.quantity.valueScaled <= 0
  )
    return err(
      "INVENTORY_RECLASSIFICATION_INVALID",
      "Reclassification requires distinct grades and a positive exact quantity.",
    );
  return ok(command.payload.quantity.valueScaled);
}

export const classifyInventory = (quantityScaled: number) =>
  quantityScaled > 0
    ? ("positive" as const)
    : quantityScaled < 0
      ? ("negative" as const)
      : ("zero" as const);

export * from "./stock-planning.ts";
