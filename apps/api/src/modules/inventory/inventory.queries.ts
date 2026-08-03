import type {
  InventoryTimelineInput,
  IsoInstant,
  ProductId,
  QualityGradeId,
  PurchaseId,
  WorkspaceId,
  Unit,
} from "@vuarau/domain-contracts";
import { denied, roleHasPermission } from "@vuarau/domain-contracts";
import { canVoidPurchase, err, ok } from "@vuarau/domain-kernel";
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
    execute: async ({ repos, membership }) => {
      const purchase = await repos.purchases.findById(input.workspaceId, input.purchaseId);
      return {
        purchase,
        receipts: await repos.inventoryReads.receipts(input.workspaceId, input.purchaseId),
        hasActiveArrival:
          purchase === null
            ? false
            : await repos.goodsArrivals.hasActiveForPurchase(input.workspaceId, purchase.id),
        acceptedAfterInspection:
          purchase === null
            ? new Map<string, number>()
            : new Map(
                await Promise.all(
                  purchase.lines.map(
                    async (line) =>
                      [
                        line.lineId,
                        (
                          await repos.qualityDispositions.acceptedQuantityForPurchaseLine(
                            input.workspaceId,
                            line.lineId,
                          )
                        )?.valueScaled ?? 0,
                      ] as const,
                  ),
                ),
              ),
        role: membership.role,
        roles: membership.roles,
      };
    },
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
  const aggregateVoidCapability = canVoidPurchase({
    purchase: result.value.purchase,
    hasActiveReceipts:
      result.value.hasActiveArrival ||
      [...received.values()].some((quantity) => quantity > 0) ||
      [...result.value.acceptedAfterInspection.values()].some((quantity) => quantity > 0),
  });
  const voidPurchaseCapability = roleHasPermission(result.value.roles, "purchase.void")
    ? aggregateVoidCapability
    : denied("PERMISSION_DENIED", {
        permission: "purchase.void",
        role: result.value.role,
        roles: result.value.roles,
      });
  return ok({
    purchaseId: result.value.purchase.id,
    capabilities: { voidPurchase: voidPurchaseCapability },
    lines: result.value.purchase.lines.map((line) => {
      const receivedScaled =
        (received.get(line.lineId) ?? 0) +
        (result.value.acceptedAfterInspection.get(line.lineId) ?? 0);
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
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId?: QualityGradeId | null | undefined;
  },
) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "inventory.read",
    execute: async ({ repos }) => {
      const rows = await repos.inventoryReads.balances(input.workspaceId, input.productId);
      return input.qualityGradeId === undefined
        ? rows
        : rows.filter((row) => row.qualityGradeId === input.qualityGradeId);
    },
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
          qualityGradeId: input.qualityGradeId,
          unit: input.unit,
          page: toPageQuery(input),
        }),
        (row) => row,
      ),
  });

export const getInventoryReconciliation = (
  ctx: CommandContext,
  input: {
    workspaceId: WorkspaceId;
    productId: ProductId;
    qualityGradeId: QualityGradeId | null;
    unit: Unit;
  },
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
          qualityGradeId: input.qualityGradeId,
          unit: input.unit,
          projected: null,
          canonical: null,
          diagnostics: ["product_not_found"],
        };
      const [movements, projections, integrity] = await Promise.all([
        repos.inventoryMovements.listByProduct(input.workspaceId, input.productId, input.unit),
        repos.inventoryReads.balances(input.workspaceId, input.productId),
        repos.inventoryReads.integrity(
          input.workspaceId,
          input.productId,
          input.qualityGradeId,
          input.unit,
        ),
      ]);
      const gradedMovements = movements.filter(
        (movement) => movement.qualityGradeId === input.qualityGradeId,
      );
      const quantityScaled = gradedMovements.reduce(
        (total, movement) => total + movement.quantity.valueScaled,
        0,
      );
      const last = gradedMovements.reduce<null | string>(
        (current, movement) =>
          current === null || movement.transactionTime > current
            ? movement.transactionTime
            : current,
        null,
      ) as IsoInstant | null;
      const projected =
        projections.find(
          (row) => row.unit === input.unit && row.qualityGradeId === input.qualityGradeId,
        ) ?? null;
      const canonical = {
        workspaceId: input.workspaceId,
        productId: input.productId,
        qualityGradeId: input.qualityGradeId,
        qualityGradeName: projected?.qualityGradeName ?? null,
        unit: input.unit,
        quantityScaled,
        classification:
          quantityScaled > 0
            ? ("positive" as const)
            : quantityScaled < 0
              ? ("negative" as const)
              : ("zero" as const),
        movementCount: gradedMovements.length,
        lastMovementTransactionTime: last,
        updatedAt: gradedMovements[gradedMovements.length - 1]?.recordedAt ?? product.updatedAt,
      };
      if (integrity.length > 0)
        return {
          status: "integrity_failure" as const,
          productId: input.productId,
          qualityGradeId: input.qualityGradeId,
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
        ...(projected !== null && projected.movementCount !== gradedMovements.length
          ? ["movement_count_drift"]
          : []),
        ...(projected !== null && projected.lastMovementTransactionTime !== last
          ? ["latest_transaction_drift"]
          : []),
      ];
      return {
        status: diagnostics.length === 0 ? ("consistent" as const) : ("inconsistent" as const),
        productId: input.productId,
        qualityGradeId: input.qualityGradeId,
        unit: input.unit,
        projected,
        canonical,
        diagnostics,
      };
    },
  });
