import { reportInputSchema } from "@vuarau/domain-contracts";
import { authenticatedProcedure, router, unwrap } from "../trpc.ts";
import {
  getOperationalReport,
  getOperationalReportCsv,
} from "../../../modules/report/report.queries.ts";

export const reportRouter = router({
  operational: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReport(ctx, input))),
  csv: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReportCsv(ctx, input))),
});
