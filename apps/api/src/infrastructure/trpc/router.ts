import { z } from "zod";
import {
  accountTimelineInputSchema,
  adjustCustomerDebtCommandSchema,
  auditTimelineInputSchema,
  createCustomerCommandSchema,
  createSaleDraftCommandSchema,
  deactivateCustomerCommandSchema,
  discardSaleDraftCommandSchema,
  customerIdSchema,
  getCustomerInputSchema,
  getPaymentInputSchema,
  getSaleInputSchema,
  listPaymentsInputSchema,
  listSalesInputSchema,
  postSaleCommandSchema,
  recordCustomerPaymentCommandSchema,
  reverseCustomerPaymentCommandSchema,
  revokeWorkspaceMembershipCommandSchema,
  searchCustomersInputSchema,
  updateCustomerCommandSchema,
  updateSaleDraftCommandSchema,
  voidSaleCommandSchema,
  workspaceIdSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "./trpc.ts";
import { createCustomer } from "../../modules/customer/create-customer.handler.ts";
import {
  deactivateCustomer,
  updateCustomer,
} from "../../modules/customer/update-customer.handler.ts";
import { discardSaleDraft, updateSaleDraft } from "../../modules/sale/edit-sale-draft.handler.ts";
import { revokeWorkspaceMembership } from "../../modules/session/revoke-membership.handler.ts";
import { createSaleDraft } from "../../modules/sale/create-sale-draft.handler.ts";
import { postSale } from "../../modules/sale/post-sale.handler.ts";
import { voidSale } from "../../modules/sale/void-sale.handler.ts";
import { recordCustomerPayment } from "../../modules/payment/record-payment.handler.ts";
import { reverseCustomerPayment } from "../../modules/payment/reverse-payment.handler.ts";
import { adjustCustomerDebt } from "../../modules/account/adjust-debt.handler.ts";
import {
  getCustomerAccountBalance,
  getCustomerAccountTimeline,
  listCustomerAccountEntries,
} from "../../modules/account/account.queries.ts";
import { getCustomer, searchCustomers } from "../../modules/customer/customer.queries.ts";
import { getSale, listSales } from "../../modules/sale/sale.queries.ts";
import { getPayment, listPayments } from "../../modules/payment/payment.queries.ts";
import { getAuditTimeline } from "../../modules/audit/audit.queries.ts";
import { getSession } from "../../modules/session/session.queries.ts";

/**
 * Twelve mutations, one per business command. No `update`, no `patch`, and no
 * procedure that takes a status as an argument (ADR-0002).
 *
 * Every procedure — read or write — requires a verified identity. There is no
 * `publicProcedure` in this router on purpose: a depot's account book has no
 * public surface, and an unauthenticated read was a P0 leak before Milestone 1.
 *
 * `rebuildCustomerAccountBalance` is deliberately absent: it is an operator's
 * maintenance tool, not something a UI should be able to trigger.
 */
/**
 * The read surface a first UI needs, added alongside the commands rather than in
 * a separate namespace: a screen that lists sales and posts one is talking about
 * the same thing, and splitting `sale.list` from `sale.post` across two routers
 * would only make the client assemble what the model already joins.
 *
 * Every read is authorized exactly like a command, through the same
 * `authorizeWorkspaceAccess` (BR-AUTH-001). Reads were the hole before
 * Milestone 1 and the shape of that mistake is one query at a time.
 */
const sessionRouter = router({
  me: authenticatedProcedure
    .input(z.object({ workspaceId: workspaceIdSchema }))
    .query(async ({ ctx, input }) => unwrap(await getSession(ctx, input.workspaceId))),

  /**
   * Revocation takes effect on the **next request**: membership is re-read on
   * every command and every query, so there is no session to expire.
   */
  revokeMembership: commandProcedure
    .input(revokeWorkspaceMembershipCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await revokeWorkspaceMembership(ctx, input))),
});

const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx, input))),

  update: commandProcedure
    .input(updateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateCustomer(ctx, input))),

  deactivate: commandProcedure
    .input(deactivateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateCustomer(ctx, input))),

  search: authenticatedProcedure
    .input(searchCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchCustomers(ctx, input))),

  get: authenticatedProcedure
    .input(getCustomerInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomer(ctx, input))),
});

const saleRouter = router({
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
});

const paymentRouter = router({
  record: commandProcedure
    .input(recordCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCustomerPayment(ctx, input))),

  reverse: commandProcedure
    .input(reverseCustomerPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCustomerPayment(ctx, input))),

  get: authenticatedProcedure
    .input(getPaymentInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getPayment(ctx, input))),

  list: authenticatedProcedure
    .input(listPaymentsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listPayments(ctx, input))),
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

  /**
   * The paged, source-resolved, running-balance version of `entries`. Both exist:
   * `entries` is the raw ledger a rebuild or an export reads, `timeline` is what
   * a person reads.
   */
  timeline: authenticatedProcedure
    .input(accountTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomerAccountTimeline(ctx, input))),
});

const auditRouter = router({
  timeline: authenticatedProcedure
    .input(auditTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAuditTimeline(ctx, input))),
});

const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx, input))),
});

export const appRouter = router({
  session: sessionRouter,
  customer: customerRouter,
  sale: saleRouter,
  payment: paymentRouter,
  account: accountRouter,
  audit: auditRouter,
  debt: debtRouter,
});

export type AppRouter = typeof appRouter;
