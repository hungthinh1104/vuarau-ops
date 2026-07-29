import type {
  InventoryTimelineInput,
  IsoInstant,
  ProductId,
  PurchaseId,
  WorkspaceId,
  Unit,
} from "@vuarau/domain-contracts";
import { err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

export async function getReceipt(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; receiptId: string },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: ({ repos }) => repos.inventoryReads.receipt(input.workspaceId, input.receiptId),
  });
  if (!result.ok) return result;
  return result.value === null ? err("RECEIPT_NOT_FOUND", "No such Receipt.") : ok(result.value);
}
export async function getInventoryAdjustment(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; adjustmentId: string },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) => repos.inventoryReads.adjustment(input.workspaceId, input.adjustmentId),
  });
  if (!result.ok) return result;
  return result.value === null
    ? err("PRODUCT_NOT_FOUND", "No such inventory adjustment.")
    : ok(result.value);
}
export const listPurchaseReceipts = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; purchaseId: PurchaseId },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: ({ repos }) => repos.inventoryReads.receipts(input.workspaceId, input.purchaseId),
  });
export async function getPurchaseReceivingSummary(
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; purchaseId: PurchaseId },
) {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "receiving.read",
    execute: async ({ repos }) => ({
      purchase: await repos.purchases.findById(input.workspaceId, input.purchaseId),
      receipts: await repos.inventoryReads.receipts(input.workspaceId, input.purchaseId),
    }),
  });
  if (!result.ok) return result;
  if (result.value.purchase === null) return err("PURCHASE_NOT_FOUND", "No such Purchase.");
  const received = new Map<string, number>();
  for (const receipt of result.value.receipts) {
    if (receipt.reversal !== null) continue;
    for (const line of receipt.lines)
      received.set(
        line.purchaseLineId,
        (received.get(line.purchaseLineId) ?? 0) + line.quantity.valueScaled,
      );
  }
  return ok({
    purchaseId: result.value.purchase.id,
    lines: result.value.purchase.lines.map((line) => {
      const receivedScaled = received.get(line.lineId) ?? 0;
      return {
        purchaseLineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        ordered: line.quantity,
        received: { valueScaled: receivedScaled, unit: line.quantity.unit },
        remaining: {
          valueScaled: line.quantity.valueScaled - receivedScaled,
          unit: line.quantity.unit,
        },
      };
    }),
  });
}
export const getInventoryBalances = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; productId: ProductId },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: ({ repos }) => repos.inventoryReads.balances(input.workspaceId, input.productId),
  });
export const getInventoryTimeline = (ctx: CommandContext, input: InventoryTimelineInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) =>
      toPage(
        await repos.inventoryReads.timeline({
          workspaceId: input.workspaceId,
          productId: input.productId,
          unit: input.unit,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export const getInventoryReconciliation = (
  ctx: CommandContext,
  input: { workspaceId: WorkspaceId; productId: ProductId; unit: Unit },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const product = await repos.products.findById(input.workspaceId, input.productId);
      if (product === null)
        return {
          status: "not_found" as const,
          productId: input.productId,
          unit: input.unit,
          projected: null,
          canonical: null,
          diagnostics: ["product_not_found"],
        };
      const [movements, projections, integrity] = await Promise.all([
        repos.inventoryMovements.listByProduct(input.workspaceId, input.productId, input.unit),
        repos.inventoryReads.balances(input.workspaceId, input.productId),
        repos.inventoryReads.integrity(input.workspaceId, input.productId, input.unit),
      ]);
      const quantityScaled = movements.reduce(
        (total, movement) => total + movement.quantity.valueScaled,
        0,
      );
      const last = movements.reduce<null | string>(
        (current, movement) =>
          current === null || movement.transactionTime > current
            ? movement.transactionTime
            : current,
        null,
      ) as IsoInstant | null;
      const projected = projections.find((row) => row.unit === input.unit) ?? null;
      const canonical = {
        workspaceId: input.workspaceId,
        productId: input.productId,
        unit: input.unit,
        quantityScaled,
        classification:
          quantityScaled > 0
            ? ("positive" as const)
            : quantityScaled < 0
              ? ("negative" as const)
              : ("zero" as const),
        movementCount: movements.length,
        lastMovementTransactionTime: last,
        updatedAt: movements[movements.length - 1]?.recordedAt ?? product.updatedAt,
      };
      if (integrity.length > 0)
        return {
          status: "integrity_failure" as const,
          productId: input.productId,
          unit: input.unit,
          projected,
          canonical,
          diagnostics: [...integrity],
        };
      const diagnostics = [
        ...(projected === null ? ["projection_missing"] : []),
        ...(projected !== null && projected.quantityScaled !== quantityScaled
          ? ["quantity_drift"]
          : []),
        ...(projected !== null && projected.movementCount !== movements.length
          ? ["movement_count_drift"]
          : []),
        ...(projected !== null && projected.lastMovementTransactionTime !== last
          ? ["latest_transaction_drift"]
          : []),
      ];
      return {
        status: diagnostics.length === 0 ? ("consistent" as const) : ("inconsistent" as const),
        productId: input.productId,
        unit: input.unit,
        projected,
        canonical,
        diagnostics,
      };
    },
  });
