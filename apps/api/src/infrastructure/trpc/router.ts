import { z } from "zod";
import {
  adjustCustomerDebtCommandSchema,
  confirmOrderCommandSchema,
  createCustomerCommandSchema,
  createOrderCommandSchema,
  customerIdSchema,
  recordCustomerPaymentCommandSchema,
  reverseCustomerPaymentCommandSchema,
  workspaceIdSchema,
} from "@vuanha/domain-contracts";
import { commandProcedure, publicProcedure, router, unwrap } from "./trpc.ts";
import { createCustomer } from "../../modules/customer/create-customer.handler.ts";
import { createOrder } from "../../modules/order/create-order.handler.ts";
import { confirmOrder } from "../../modules/order/confirm-order.handler.ts";
import { recordCustomerPayment } from "../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../modules/payment/reverse-payment.handler.ts";
import { adjustCustomerDebt } from "../../modules/debt/adjust-debt.handler.ts";
import { getCustomerDebtSummary, listCustomerLedger } from "../../modules/debt/debt.queries.ts";

/**
 * Six mutations, one per business command. No `update`, no `patch`, no procedure
 * that takes a status as an argument (ADR-0002).
 *
 * `rebuildDebtSummary` is deliberately absent: it is an operator's maintenance
 * tool, not something a UI should be able to trigger.
 */
const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx.deps, input))),
});

const orderRouter = router({
  create: commandProcedure
    .input(createOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createOrder(ctx.deps, input))),

  confirm: commandProcedure
    .input(confirmOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmOrder(ctx.deps, input))),
});

const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx.deps, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx.deps, input))),
});

const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx.deps, input))),

  summary: publicProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(({ ctx, input }) =>
      getCustomerDebtSummary(ctx.deps, input.workspaceId, input.customerId),
    ),

  ledger: publicProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(({ ctx, input }) => listCustomerLedger(ctx.deps, input.workspaceId, input.customerId)),
});

export const appRouter = router({
  customer: customerRouter,
  order: orderRouter,
  payment: paymentRouter,
  debt: debtRouter,
});

export type AppRouter = typeof appRouter;
