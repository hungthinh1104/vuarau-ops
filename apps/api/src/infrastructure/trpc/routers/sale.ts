import {
  createSaleDraftCommandSchema,
  discardSaleDraftCommandSchema,
  getSaleInputSchema,
  saleCaptureContextInputSchema,
  saleDetailInputSchema,
  listSalesInputSchema,
  postSaleCommandSchema,
  updateSaleDraftCommandSchema,
  voidSaleCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  discardSaleDraft,
  updateSaleDraft,
} from "../../../modules/sale/edit-sale-draft.handler.ts";
import { createSaleDraft } from "../../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../../modules/sale/void-sale.handler.ts";
import {
  captureContext,
  getSale,
  getSaleDetail,
  listSales,
} from "../../../modules/sale/sale.queries.ts";

export const saleRouter = router({
  createDraft: commandProcedure
    .input(createSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSaleDraft(ctx, input))),

  updateDraft: commandProcedure
    .input(updateSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateSaleDraft(ctx, input))),

  discardDraft: commandProcedure
    .input(discardSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await discardSaleDraft(ctx, input))),

  post: commandProcedure
    .input(postSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await postSale(ctx, input))),

  void: commandProcedure
    .input(voidSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await voidSale(ctx, input))),

  get: authenticatedProcedure
    .input(getSaleInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSale(ctx, input))),

  list: authenticatedProcedure
    .input(listSalesInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listSales(ctx, input))),

  captureContext: authenticatedProcedure
    .input(saleCaptureContextInputSchema)
    .query(async ({ ctx, input }) => unwrap(await captureContext(ctx, input))),

  detail: authenticatedProcedure
    .input(saleDetailInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSaleDetail(ctx, input))),
});
