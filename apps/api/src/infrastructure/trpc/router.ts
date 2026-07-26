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
import { authenticatedProcedure, commandProcedure, router, unwrap } from "./trpc.ts";
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
 * Every procedure — read or write — requires a verified identity. There is no
 * `publicProcedure` in this router on purpose: a depot's debt book has no public
 * surface, and an unauthenticated read was a P0 leak before Milestone 1.
 *
 * `rebuildDebtSummary` is deliberately absent: it is an operator's maintenance
 * tool, not something a UI should be able to trigger.
 */
const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx, input))),
});

const orderRouter = router({
  create: commandProcedure
    .input(createOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createOrder(ctx, input))),

  confirm: commandProcedure
    .input(confirmOrderCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await confirmOrder(ctx, input))),
});

const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx, input))),
});

const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx, input))),

  summary: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await getCustomerDebtSummary(ctx, input.workspaceId, input.customerId)),
    ),

  ledger: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await listCustomerLedger(ctx, input.workspaceId, input.customerId)),
    ),
});

export const appRouter = router({
  customer: customerRouter,
  order: orderRouter,
  payment: paymentRouter,
  debt: debtRouter,
});

export type AppRouter = typeof appRouter;
