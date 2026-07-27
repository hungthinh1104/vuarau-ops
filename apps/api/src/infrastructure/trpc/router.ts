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
  recentCustomersInputSchema,
  getPaymentInputSchema,
  getSaleInputSchema,
  saleCaptureContextInputSchema,
  saleDetailInputSchema,
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
} from "../../modules/account/account.queries.ts";
import {
  getCustomer,
  recentCustomers,
  searchCustomers,
} from "../../modules/customer/customer.queries.ts";
import {
  captureContext,
  getSale,
  getSaleDetail,
  listSales,
} from "../../modules/sale/sale.queries.ts";
import { getPayment, listPayments } from "../../modules/payment/payment.queries.ts";
import { getAuditTimeline } from "../../modules/audit/audit.queries.ts";
import { getSession, listActorWorkspaces } from "../../modules/session/session.queries.ts";

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
   * The depots this caller may act in — asked before `me`, because a client
   * cannot ask "what may I do here" until it knows what "here" can be.
   *
   * **The input is empty on purpose.** An `actorId` field would be a field to
   * tamper with; the answer comes from the verified token instead (BR-AUTH-008).
   *
   * `strictObject` rather than `object`: a caller who sends `{ actorId }` is told
   * so. A silently dropped field is a field somebody eventually believes in, and
   * "I asked for their workspaces and got mine" is the sort of surprise that ends
   * with a client writing its own filter.
   */
  workspaces: authenticatedProcedure
    .input(z.strictObject({}))
    .query(async ({ ctx }) => unwrap(await listActorWorkspaces(ctx))),

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

  recent: authenticatedProcedure
    .input(recentCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await recentCustomers(ctx, input))),
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

  captureContext: authenticatedProcedure
    .input(saleCaptureContextInputSchema)
    .query(async ({ ctx, input }) => unwrap(await captureContext(ctx, input))),

  detail: authenticatedProcedure
    .input(saleDetailInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSaleDetail(ctx, input))),
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

  /**
   * The only published way to read the ledger.
   *
   * There was a second one, `account.entries`, which returned every entry a
   * customer had with no cursor and no upper bound. It was convenient for a test
   * and wrong as an API: a customer three years into a relationship with the
   * depot is an unbounded response, and the surface most worth bounding is the
   * one that answers "what does this person owe".
   *
   * Raw entries are still reachable where a bound would be wrong — the balance
   * rebuild and a future export need every entry by definition — but through the
   * repository port inside the server, not through a procedure a browser can call
   * (BR-READ-002).
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
