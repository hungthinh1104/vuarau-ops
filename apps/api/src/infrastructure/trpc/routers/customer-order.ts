import {
  cancelCustomerOrderCommandSchema,
  confirmCustomerOrderCommandSchema,
  createCustomerOrderDraftCommandSchema,
  customerOrderGetInputSchema,
  customerOrderListInputSchema,
  updateCustomerOrderDraftCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  cancelCustomerOrder,
  confirmCustomerOrder,
  createCustomerOrderDraft,
  updateCustomerOrderDraft,
} from "../../../modules/customer-order/customer-order.handlers.ts";
import {
  getCustomerOrder,
  listCustomerOrders,
} from "../../../modules/customer-order/customer-order.queries.ts";

export const customerOrderRouter = router({
  createDraft: commandProcedure
    .input(createCustomerOrderDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomerOrderDraft(ctx, input))),
  updateDraft: commandProcedure
    .input(updateCustomerOrderDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateCustomerOrderDraft(ctx, input))),
  confirm: commandProcedure
    .input(confirmCustomerOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmCustomerOrder(ctx, input))),
  cancel: commandProcedure
    .input(cancelCustomerOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await cancelCustomerOrder(ctx, input))),
  get: authenticatedProcedure
    .input(customerOrderGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomerOrder(ctx, input))),
  list: authenticatedProcedure
    .input(customerOrderListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listCustomerOrders(ctx, input))),
});
