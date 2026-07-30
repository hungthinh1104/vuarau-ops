import {
  createQualityGradeCommandSchema,
  deactivateQualityGradeCommandSchema,
  qualityGradeGetInputSchema,
  qualityGradeListInputSchema,
  reactivateQualityGradeCommandSchema,
  updateQualityGradeCommandSchema,
} from "@vuarau/domain-contracts";
import {
  createQualityGrade,
  deactivateQualityGrade,
  reactivateQualityGrade,
  updateQualityGrade,
} from "../../../modules/quality/quality.handlers.ts";
import { getQualityGrade, listQualityGrades } from "../../../modules/quality/quality.queries.ts";
import { authenticatedProcedure, commandProcedure, router, unwrap } from "../trpc.ts";

export const qualityRouter = router({
  create: commandProcedure
    .input(createQualityGradeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await createQualityGrade(ctx, input))),
  update: commandProcedure
    .input(updateQualityGradeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await updateQualityGrade(ctx, input))),
  deactivate: commandProcedure
    .input(deactivateQualityGradeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await deactivateQualityGrade(ctx, input))),
  reactivate: commandProcedure
    .input(reactivateQualityGradeCommandSchema)
    .mutation(async ({ ctx, input }) => unwrap(await reactivateQualityGrade(ctx, input))),
  list: authenticatedProcedure
    .input(qualityGradeListInputSchema)
    .query(async ({ ctx, input }) => unwrap(await listQualityGrades(ctx, input))),
  get: authenticatedProcedure
    .input(qualityGradeGetInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getQualityGrade(ctx, input))),
});
