import { z } from "zod";
import {
  accountTimelineInputSchema,
  accountReconciliationInputSchema,
  accountAdjustmentGetInputSchema,
  adjustCustomerDebtCommandSchema,
  createCustomerCommandSchema,
  deactivateCustomerCommandSchema,
  duplicateCustomerInputSchema,
  customerIdSchema,
  getCustomerInputSchema,
  recentCustomersInputSchema,
  rebuildAccountProjectionCommandSchema,
  reactivateCustomerCommandSchema,
  searchCustomersInputSchema,
  updateCustomerCommandSchema,
  workspaceIdSchema,
  debtAgingInputSchema,
  recordPaymentAllocationCommandSchema,
  reversePaymentAllocationCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import { createCustomer } from "../../../modules/customer/create-customer.handler.ts";
import {
  deactivateCustomer,
  reactivateCustomer,
  updateCustomer,
} from "../../../modules/customer/update-customer.handler.ts";
import { adjustCustomerDebt } from "../../../modules/account/adjust-debt.handler.ts";
import {
  recordPaymentAllocation,
  reversePaymentAllocation,
} from "../../../modules/account/payment-allocation.handlers.ts";
import {
  exportAccountReconciliationEvidence,
  getCustomerAccountBalance,
  getCustomerAccountTimeline,
  getAccountAdjustmentDetail,
  getAccountReconciliation,
  getCustomerDebtAging,
} from "../../../modules/account/account.queries.ts";
import { rebuildAccountProjection } from "../../../modules/account/rebuild-account-projection.handler.ts";
import {
  getCustomer,
  findPossibleDuplicateCustomers,
  recentCustomers,
  searchCustomers,
} from "../../../modules/customer/customer.queries.ts";

export const customerRouter = router({
  create: commandProcedure
    .input(createCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCustomer(ctx, input))),

  update: commandProcedure
    .input(updateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateCustomer(ctx, input))),

  deactivate: commandProcedure
    .input(deactivateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateCustomer(ctx, input))),

  reactivate: commandProcedure
    .input(reactivateCustomerCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateCustomer(ctx, input))),

  search: authenticatedProcedure
    .input(searchCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchCustomers(ctx, input))),

  get: authenticatedProcedure
    .input(getCustomerInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomer(ctx, input))),

  recent: authenticatedProcedure
    .input(recentCustomersInputSchema)
    .query(async ({ ctx, input }) => unwrap(await recentCustomers(ctx, input))),

  duplicates: authenticatedProcedure
    .input(duplicateCustomerInputSchema)
    .query(async ({ ctx, input }) => unwrap(await findPossibleDuplicateCustomers(ctx, input))),
});

export const accountRouter = router({
  adjustment: authenticatedProcedure
    .input(accountAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAccountAdjustmentDetail(ctx, input))),
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

  reconciliation: authenticatedProcedure
    .input(accountReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getAccountReconciliation(ctx, input))),

  aging: authenticatedProcedure
    .input(debtAgingInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCustomerDebtAging(ctx, input))),

  reconciliationEvidence: authenticatedProcedure
    .input(accountReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await exportAccountReconciliationEvidence(ctx, input))),

  rebuildProjection: commandProcedure
    .input(rebuildAccountProjectionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildAccountProjection(ctx, input))),
});

export const debtRouter = router({
  adjust: commandProcedure
    .input(adjustCustomerDebtCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCustomerDebt(ctx, input))),
  allocate: commandProcedure
    .input(recordPaymentAllocationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordPaymentAllocation(ctx, input))),
  reverseAllocation: commandProcedure
    .input(reversePaymentAllocationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reversePaymentAllocation(ctx, input))),
});
