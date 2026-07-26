import { z } from "zod";
import {
  adjustCustomerDebtCommandSchema,
  createCustomerCommandSchema,
  createSaleDraftCommandSchema,
  customerIdSchema,
  postSaleCommandSchema,
  recordCustomerPaymentCommandSchema,
  reverseCustomerPaymentCommandSchema,
  voidSaleCommandSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "./trpc.ts";
import { createCustomer } from "../../modules/customer/create-customer.handler.ts";
import { createSaleDraft } from "../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../modules/sale/void-sale.handler.ts";
import { recordCustomerPayment } from "../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../modules/payment/reverse-payment.handler.ts";
import { adjustCustomerDebt } from "../../modules/account/adjust-debt.handler.ts";
import {
  getCustomerAccountBalance,
  listCustomerAccountEntries,
} from "../../modules/account/account.queries.ts";

/**
 * Seven mutations, one per business command. No `update`, no `patch`, and no
 * procedure that takes a status as an argument (ADR-0002).
 *
 * Every procedure — read or write — requires a verified identity. There is no
 * `publicProcedure` in this router on purpose: a depot's account book has no
 * public surface, and an unauthenticated read was a P0 leak before Milestone 1.
 *
 * `rebuildCustomerAccountBalance` is deliberately absent: it is an operator's
 * maintenance tool, not something a UI should be able to trigger.
 */
const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx, input))),
});

const saleRouter = router({
  createDraft: commandProcedure
    .input(createSaleDraftCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSaleDraft(ctx, input))),

  post: commandProcedure
    .input(postSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await postSale(ctx, input))),

  void: commandProcedure
    .input(voidSaleCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await voidSale(ctx, input))),
});

const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx, input))),
});

/**
 * Reading an account and adjusting one live in different namespaces on purpose:
 * `account.*` is the record, `debt.adjust` is the one command that moves it by
 * hand. Keeping the sharpest command visibly separate from the ordinary reads is
 * worth the small asymmetry (ADR-0013, retained terminology).
 */
const accountRouter = router({
  balance: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await getCustomerAccountBalance(ctx, input.workspaceId, input.customerId)),
    ),

  entries: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema, customerId: customerIdSchema }))
    .query(async ({ ctx, input }) =>
      unwrap(await listCustomerAccountEntries(ctx, input.workspaceId, input.customerId)),
    ),
});

const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx, input))),
});

export const appRouter = router({
  customer: customerRouter,
  sale: saleRouter,
  payment: paymentRouter,
  account: accountRouter,
  debt: debtRouter,
});

export type AppRouter = typeof appRouter;
