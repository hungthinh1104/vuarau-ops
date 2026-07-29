import {
  createPurchaseDraftCommandSchema,
  updatePurchaseDraftCommandSchema,
  discardPurchaseDraftCommandSchema,
  confirmPurchaseCommandSchema,
  voidPurchaseCommandSchema,
  purchaseGetInputSchema,
  purchaseListInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  confirmPurchase,
  createPurchaseDraft,
  discardPurchaseDraft,
  updatePurchaseDraft,
  voidPurchase,
} from "../../../modules/purchase/purchase.handlers.ts";
import { getPurchase, listPurchases } from "../../../modules/purchase/purchase.queries.ts";

export const purchaseRouter = router({
  createDraft: commandProcedure
    .input(createPurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createPurchaseDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updatePurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updatePurchaseDraft(ctx, input))),
  discardDraft: commandProcedure
    .input(discardPurchaseDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await discardPurchaseDraft(ctx, input))),
  confirm: commandProcedure
    .input(confirmPurchaseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmPurchase(ctx, input))),
  void: commandProcedure
    .input(voidPurchaseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await voidPurchase(ctx, input))),
  get: authenticatedProcedure
    .input(purchaseGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPurchase(ctx, input))),
  list: authenticatedProcedure
    .input(purchaseListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPurchases(ctx, input))),
});
