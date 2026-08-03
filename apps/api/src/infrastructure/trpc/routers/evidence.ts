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
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";
import {
  recordCostObservation,
  recordReconciliationObservation,
  recordDebtObservation,
} from "../../../modules/evidence/evidence.handlers.ts";
import {
  getCostObservation,
  listCostObservations,
  getReconciliationObservation,
  listReconciliationObservations,
  getDebtObservation,
  listDebtObservations,
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
});
