import {
  createSupplierCommandSchema,
  updateSupplierCommandSchema,
  deactivateSupplierCommandSchema,
  reactivateSupplierCommandSchema,
  recordSupplierPaymentCommandSchema,
  reverseSupplierPaymentCommandSchema,
  adjustSupplierAccountCommandSchema,
  supplierSearchInputSchema,
  supplierGetInputSchema,
  supplierAccountInputSchema,
  supplierAccountTimelineInputSchema,
  supplierPaymentGetInputSchema,
  supplierAdjustmentGetInputSchema,
  rebuildSupplierAccountCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  adjustSupplierAccount,
  createSupplier,
  deactivateSupplier,
  reactivateSupplier,
  recordSupplierPayment,
  reverseSupplierPayment,
  updateSupplier,
} from "../../../modules/supplier/supplier.handlers.ts";
import {
  getSupplier,
  getSupplierBalance,
  getSupplierPayment,
  getSupplierAdjustment,
  getSupplierTimeline,
  searchSuppliers,
  getSupplierReconciliation,
} from "../../../modules/supplier/supplier.queries.ts";
import { rebuildSupplierAccount } from "../../../modules/supplier/rebuild-supplier-account.handler.ts";

export const supplierRouter = router({
  create: commandProcedure
    .input(createSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createSupplier(ctx, input))),
  update: commandProcedure
    .input(updateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateSupplier(ctx, input))),
  deactivate: commandProcedure
    .input(deactivateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateSupplier(ctx, input))),
  reactivate: commandProcedure
    .input(reactivateSupplierCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateSupplier(ctx, input))),
  search: authenticatedProcedure
    .input(supplierSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchSuppliers(ctx, input))),
  get: authenticatedProcedure
    .input(supplierGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplier(ctx, input))),
  getPayment: authenticatedProcedure
    .input(supplierPaymentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierPayment(ctx, input))),
  getAdjustment: authenticatedProcedure
    .input(supplierAdjustmentGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierAdjustment(ctx, input))),
  recordPayment: commandProcedure
    .input(recordSupplierPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordSupplierPayment(ctx, input))),
  reversePayment: commandProcedure
    .input(reverseSupplierPaymentCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseSupplierPayment(ctx, input))),
  adjustAccount: commandProcedure
    .input(adjustSupplierAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await adjustSupplierAccount(ctx, input))),
  balance: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierBalance(ctx, input))),
  timeline: authenticatedProcedure
    .input(supplierAccountTimelineInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierTimeline(ctx, input))),
  reconciliation: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierReconciliation(ctx, input))),
  evidence: authenticatedProcedure
    .input(supplierAccountInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierReconciliation(ctx, input))),
  rebuildAccount: commandProcedure
    .input(rebuildSupplierAccountCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await rebuildSupplierAccount(ctx, input))),
});
