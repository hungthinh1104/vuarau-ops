import {
  arrivalLineHistoryInputSchema,
  createQualityIssueCodeCommandSchema,
  deactivateQualityIssueCodeCommandSchema,
  goodsArrivalGetInputSchema,
  goodsArrivalListInputSchema,
  qualityDispositionGetInputSchema,
  qualityDispositionSourceSummaryInputSchema,
  qualityInspectionGetInputSchema,
  qualityIssueCodeSearchInputSchema,
  reactivateQualityIssueCodeCommandSchema,
  recordGoodsArrivalCommandSchema,
  recordQualityDispositionCommandSchema,
  recordQualityInspectionCommandSchema,
  reverseGoodsArrivalCommandSchema,
  reverseQualityDispositionCommandSchema,
  reverseQualityInspectionCommandSchema,
  updateQualityIssueCodeCommandSchema,
} from "@vuarau/domain-contracts";
import {
  createQualityIssueCode,
  deactivateQualityIssueCode,
  reactivateQualityIssueCode,
  recordGoodsArrival,
  recordQualityDisposition,
  recordQualityInspection,
  reverseGoodsArrival,
  reverseQualityDisposition,
  reverseQualityInspection,
  updateQualityIssueCode,
} from "../../../modules/intake/intake.handlers.ts";
import {
  getArrivalLineHistory,
  getDispositionSourceSummary,
  getGoodsArrival,
  getQualityDisposition,
  getQualityInspection,
  listGoodsArrivals,
  searchQualityIssueCodes,
} from "../../../modules/intake/intake.queries.ts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";

export const intakeRouter = router({
  createIssueCode: commandProcedure
    .input(createQualityIssueCodeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createQualityIssueCode(ctx, input))),
  updateIssueCode: commandProcedure
    .input(updateQualityIssueCodeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateQualityIssueCode(ctx, input))),
  deactivateIssueCode: commandProcedure
    .input(deactivateQualityIssueCodeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateQualityIssueCode(ctx, input))),
  reactivateIssueCode: commandProcedure
    .input(reactivateQualityIssueCodeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateQualityIssueCode(ctx, input))),
  recordArrival: commandProcedure
    .input(recordGoodsArrivalCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordGoodsArrival(ctx, input))),
  reverseArrival: commandProcedure
    .input(reverseGoodsArrivalCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseGoodsArrival(ctx, input))),
  recordInspection: commandProcedure
    .input(recordQualityInspectionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordQualityInspection(ctx, input))),
  reverseInspection: commandProcedure
    .input(reverseQualityInspectionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseQualityInspection(ctx, input))),
  recordDisposition: commandProcedure
    .input(recordQualityDispositionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordQualityDisposition(ctx, input))),
  reverseDisposition: commandProcedure
    .input(reverseQualityDispositionCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reverseQualityDisposition(ctx, input))),
  searchIssueCodes: authenticatedProcedure
    .input(qualityIssueCodeSearchInputSchema)
    .query(async ({ ctx, input }) => unwrap(await searchQualityIssueCodes(ctx, input))),
  getArrival: authenticatedProcedure
    .input(goodsArrivalGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getGoodsArrival(ctx, input))),
  listArrivals: authenticatedProcedure
    .input(goodsArrivalListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listGoodsArrivals(ctx, input))),
  getInspection: authenticatedProcedure
    .input(qualityInspectionGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getQualityInspection(ctx, input))),
  getDisposition: authenticatedProcedure
    .input(qualityDispositionGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getQualityDisposition(ctx, input))),
  dispositionSourceSummary: authenticatedProcedure
    .input(qualityDispositionSourceSummaryInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getDispositionSourceSummary(ctx, input))),
  arrivalLineHistory: authenticatedProcedure
    .input(arrivalLineHistoryInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getArrivalLineHistory(ctx, input))),
});
