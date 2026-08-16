import {
  getPaymentInputSchema,
  listPaymentsInputSchema,
  preserveCustomerPaymentAsCreditCommandSchema,
  recordCustomerPaymentCommandSchema,
  reverseCustomerPaymentCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import { recordCustomerPayment } from "../../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../../modules/payment/reverse-payment.handler.ts";
import { preserveCustomerPaymentAsCredit } from "../../../modules/payment/customer-credit-preservation.handler.ts";
import { getPayment, listPayments } from "../../../modules/payment/payment.queries.ts";

export const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx, input))),

  preserveCustomerCredit: commandProcedure
    .input(preserveCustomerPaymentAsCreditCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await preserveCustomerPaymentAsCredit(ctx, input))),

  get: authenticatedProcedure
    .input(getPaymentInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPayment(ctx, input))),

  list: authenticatedProcedure
    .input(listPaymentsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPayments(ctx, input))),
});
