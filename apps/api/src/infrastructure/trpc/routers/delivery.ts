import {
  createDeliveryDraftCommandSchema,
  updateDeliveryDraftCommandSchema,
  cancelDeliveryDraftCommandSchema,
  dispatchDeliveryCommandSchema,
  markDeliveryDeliveredCommandSchema,
  recordDeliveryReturnCommandSchema,
  deliveryGetInputSchema,
  deliveryListInputSchema,
  saleFulfilmentInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  cancelDeliveryDraft,
  createDeliveryDraft,
  dispatchDelivery,
  markDeliveryDelivered,
  recordDeliveryReturn,
  updateDeliveryDraft,
} from "../../../modules/delivery/delivery.handlers.ts";
import {
  getDelivery,
  getSaleFulfilment,
  listDeliveries,
} from "../../../modules/delivery/delivery.queries.ts";

export const deliveryRouter = router({
  createDraft: commandProcedure
    .input(createDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createDeliveryDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updateDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateDeliveryDraft(ctx, input))),
  cancelDraft: commandProcedure
    .input(cancelDeliveryDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await cancelDeliveryDraft(ctx, input))),
  dispatch: commandProcedure
    .input(dispatchDeliveryCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await dispatchDelivery(ctx, input))),
  markDelivered: commandProcedure
    .input(markDeliveryDeliveredCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await markDeliveryDelivered(ctx, input))),
  recordReturn: commandProcedure
    .input(recordDeliveryReturnCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordDeliveryReturn(ctx, input))),
  get: authenticatedProcedure
    .input(deliveryGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDelivery(ctx, input))),
  list: authenticatedProcedure
    .input(deliveryListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listDeliveries(ctx, input))),
  fulfilment: authenticatedProcedure
    .input(saleFulfilmentInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSaleFulfilment(ctx, input))),
});
