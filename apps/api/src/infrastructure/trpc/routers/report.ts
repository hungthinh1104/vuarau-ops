import { reportDefinitionsInputSchema, reportInputSchema } from "@vuarau/domain-contracts";
import { authenticatedProcedure, router, unwrap } from "../trpc.ts";
import {
  getReportDefinitions,
  getOperationalReport,
  getOperationalReportCsv,
} from "../../../modules/report/report.queries.ts";

export const reportRouter = router({
  definitions: authenticatedProcedure
    .input(reportDefinitionsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReportDefinitions(ctx, input))),
  operational: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReport(ctx, input))),
  csv: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReportCsv(ctx, input))),
});
