import {
  managementIntelligenceInputSchema,
  reportDefinitionsInputSchema,
  reportInputSchema,
} from "@vuarau/domain-contracts";
import { authenticatedProcedure, router, unwrap } from "../trpc.ts";
import {
  getReportDefinitions,
  getReportMetricDefinitions,
  getOperationalReport,
  getOperationalReportCsv,
} from "../../../modules/report/report.queries.ts";
import { getManagementIntelligence } from "../../../modules/report/management-intelligence.queries.ts";

export const reportRouter = router({
  definitions: authenticatedProcedure
    .input(reportDefinitionsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReportDefinitions(ctx, input))),
  metrics: authenticatedProcedure
    .input(reportDefinitionsInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getReportMetricDefinitions(ctx, input))),
  intelligence: authenticatedProcedure
    .input(managementIntelligenceInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getManagementIntelligence(ctx, input))),
  operational: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReport(ctx, input))),
  csv: authenticatedProcedure
    .input(reportInputSchema)
    .query(async ({ ctx, input }) => unwrap(await getOperationalReportCsv(ctx, input))),
});
