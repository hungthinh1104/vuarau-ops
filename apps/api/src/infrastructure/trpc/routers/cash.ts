import {
  adjustCashCommandSchema,
  cashAccountGetInputSchema,
  cashAccountSearchInputSchema,
  cashReconciliationInputSchema,
  cashTimelineInputSchema,
  cashTransferGetInputSchema,
  createCashAccountCommandSchema,
  deactivateCashAccountCommandSchema,
  expenseGetInputSchema,
  reactivateCashAccountCommandSchema,
  rebuildCashBalanceCommandSchema,
  recordCashTransferCommandSchema,
  recordExpenseCommandSchema,
  reverseCashTransferCommandSchema,
  reverseExpenseCommandSchema,
  updateCashAccountCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  adjustCash,
  createCashAccount,
  deactivateCashAccount,
  reactivateCashAccount,
  rebuildCashBalance,
  recordCashTransfer,
  recordExpense,
  reverseCashTransfer,
  reverseExpense,
  updateCashAccount,
} from "../../../modules/cash/cash.handlers.ts";
import {
  getCashAccount,
  getCashReconciliation,
  getCashTimeline,
  getCashTransfer,
  getExpense,
  searchCashAccounts,
} from "../../../modules/cash/cash.queries.ts";

export const cashRouter = router({
  createAccount: commandProcedure
    .input(createCashAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createCashAccount(ctx, input))),
  updateAccount: commandProcedure
    .input(updateCashAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateCashAccount(ctx, input))),
  deactivateAccount: commandProcedure
    .input(deactivateCashAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateCashAccount(ctx, input))),
  reactivateAccount: commandProcedure
    .input(reactivateCashAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateCashAccount(ctx, input))),
  searchAccounts: authenticatedProcedure
    .input(cashAccountSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchCashAccounts(ctx, input))),
  getAccount: authenticatedProcedure
    .input(cashAccountGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCashAccount(ctx, input))),
  timeline: authenticatedProcedure
    .input(cashTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCashTimeline(ctx, input))),
  recordExpense: commandProcedure
    .input(recordExpenseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordExpense(ctx, input))),
  reverseExpense: commandProcedure
    .input(reverseExpenseCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseExpense(ctx, input))),
  getExpense: authenticatedProcedure
    .input(expenseGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getExpense(ctx, input))),
  transfer: commandProcedure
    .input(recordCashTransferCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCashTransfer(ctx, input))),
  reverseTransfer: commandProcedure
    .input(reverseCashTransferCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseCashTransfer(ctx, input))),
  getTransfer: authenticatedProcedure
    .input(cashTransferGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCashTransfer(ctx, input))),
  adjust: commandProcedure
    .input(adjustCashCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustCash(ctx, input))),
  reconciliation: authenticatedProcedure
    .input(cashReconciliationInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCashReconciliation(ctx, input))),
  rebuild: commandProcedure
    .input(rebuildCashBalanceCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildCashBalance(ctx, input))),
});
