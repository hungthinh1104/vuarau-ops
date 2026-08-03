import {
  costObservationGetInputSchema,
  costObservationListInputSchema,
  recordCostObservationCommandSchema,
  reconciliationObservationGetInputSchema,
  reconciliationObservationListInputSchema,
  recordReconciliationObservationCommandSchema,
  debtObservationGetInputSchema,
  debtObservationListInputSchema,
  recordDebtObservationCommandSchema,
  supplyCommitmentObservationGetInputSchema,
  supplyCommitmentObservationListInputSchema,
  recordSupplyCommitmentObservationCommandSchema,
  supplierObservationGetInputSchema,
  supplierObservationListInputSchema,
  recordSupplierObservationCommandSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
  recordDebtObservation,
  recordSupplyCommitmentObservation,
  recordSupplierObservation,
} from "../../../modules/evidence/evidence.handlers.ts";
import {
  getCostObservation,
  listCostObservations,
  getReconciliationObservation,
  listReconciliationObservations,
  getDebtObservation,
  listDebtObservations,
  getSupplyCommitmentObservation,
  listSupplyCommitmentObservations,
  getSupplierObservation,
  listSupplierObservations,
} from "../../../modules/evidence/evidence.queries.ts";

export const evidenceRouter = router({
  recordCostObservation: commandProcedure
    .input(recordCostObservationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordCostObservation(ctx, input))),
  recordReconciliationObservation: commandProcedure
    .input(recordReconciliationObservationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordReconciliationObservation(ctx, input))),
  recordDebtObservation: commandProcedure
    .input(recordDebtObservationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordDebtObservation(ctx, input))),
  recordSupplyCommitmentObservation: commandProcedure
    .input(recordSupplyCommitmentObservationCommandSchema)
    .mutation(async ({ ctx, input }) =>
      unwrap(await recordSupplyCommitmentObservation(ctx, input)),
    ),
  recordSupplierObservation: commandProcedure
    .input(recordSupplierObservationCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordSupplierObservation(ctx, input))),
  getCostObservation: authenticatedProcedure
    .input(costObservationGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getCostObservation(ctx, input))),
  listCostObservations: authenticatedProcedure
    .input(costObservationListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listCostObservations(ctx, input))),
  getReconciliationObservation: authenticatedProcedure
    .input(reconciliationObservationGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReconciliationObservation(ctx, input))),
  listReconciliationObservations: authenticatedProcedure
    .input(reconciliationObservationListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listReconciliationObservations(ctx, input))),
  getDebtObservation: authenticatedProcedure
    .input(debtObservationGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDebtObservation(ctx, input))),
  listDebtObservations: authenticatedProcedure
    .input(debtObservationListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listDebtObservations(ctx, input))),
  getSupplyCommitmentObservation: authenticatedProcedure
    .input(supplyCommitmentObservationGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplyCommitmentObservation(ctx, input))),
  listSupplyCommitmentObservations: authenticatedProcedure
    .input(supplyCommitmentObservationListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listSupplyCommitmentObservations(ctx, input))),
  getSupplierObservation: authenticatedProcedure
    .input(supplierObservationGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getSupplierObservation(ctx, input))),
  listSupplierObservations: authenticatedProcedure
    .input(supplierObservationListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listSupplierObservations(ctx, input))),
});
