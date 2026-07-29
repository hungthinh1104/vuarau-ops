import {
  recordPurchaseReceiptCommandSchema,
  reversePurchaseReceiptCommandSchema,
  adjustInventoryCommandSchema,
  receiptGetInputSchema,
  purchaseReceiptsInputSchema,
  inventoryBalanceInputSchema,
  inventoryTimelineInputSchema,
  inventoryAdjustmentGetInputSchema,
  inventoryReconciliationInputSchema,
  rebuildInventoryCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  adjustInventory,
  recordPurchaseReceipt,
  reversePurchaseReceipt,
} from "../../../modules/inventory/inventory.handlers.ts";
import {
  getInventoryBalances,
  getInventoryTimeline,
  getInventoryAdjustment,
  getReceipt,
  getInventoryReconciliation,
  getPurchaseReceivingSummary,
  listPurchaseReceipts,
} from "../../../modules/inventory/inventory.queries.ts";
import { rebuildInventory } from "../../../modules/inventory/rebuild-inventory.handler.ts";

export const receivingRouter = router({
  record: commandProcedure
    .input(recordPurchaseReceiptCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordPurchaseReceipt(ctx, input))),
  reverse: commandProcedure
    .input(reversePurchaseReceiptCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reversePurchaseReceipt(ctx, input))),
  get: authenticatedProcedure
    .input(receiptGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReceipt(ctx, input))),
  listForPurchase: authenticatedProcedure
    .input(purchaseReceiptsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPurchaseReceipts(ctx, input))),
  summaryForPurchase: authenticatedProcedure
    .input(purchaseReceiptsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPurchaseReceivingSummary(ctx, input))),
});

export const inventoryRouter = router({
  adjust: commandProcedure
    .input(adjustInventoryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustInventory(ctx, input))),
  balances: authenticatedProcedure
    .input(inventoryBalanceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryBalances(ctx, input))),
  getAdjustment: authenticatedProcedure
    .input(inventoryAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryAdjustment(ctx, input))),
  timeline: authenticatedProcedure
    .input(inventoryTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryTimeline(ctx, input))),
  reconciliation: authenticatedProcedure
    .input(inventoryReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryReconciliation(ctx, input))),
  evidence: authenticatedProcedure
    .input(inventoryReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getInventoryReconciliation(ctx, input))),
  rebuild: commandProcedure
    .input(rebuildInventoryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildInventory(ctx, input))),
});
