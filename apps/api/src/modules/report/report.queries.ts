import {
  decodeCursor,
  defaultWorkspaceOperationalProfile,
  REPORT_DEFINITIONS_DTO,
  type ReportDefinitionsInput,
  type OperationalReportDto,
  type ReportInput,
} from "@vuarau/domain-contracts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPageQuery } from "../shared/read-pipeline.ts";
import { currentRequestId, log } from "../../infrastructure/logging.ts";
import { csvCell } from "./csv.ts";

/**
 * These report families read rebuildable projection rows. A workspace integrity
 * warning must not leave their last projection looking like current truth.
 * Canonical activity/movement reports can still show their source facts with an
 * explicit attention state; projection-backed totals fail closed instead.
 */
const PROJECTION_BACKED_REPORTS = new Set<ReportInput["reportType"]>([
  "customer_receivables",
  "supplier_payables",
  "inventory_by_product_unit",
  "cash_balances",
]);

const projectionUnavailableDiagnostic = "report_projection_unavailable";

export const getReportDefinitions = (ctx: CommandContext, input: ReportDefinitionsInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async () => REPORT_DEFINITIONS_DTO,
  });

function protectReportAgainstIntegrityDrift(
  report: OperationalReportDto,
  integrityStatus: "healthy" | "attention",
): OperationalReportDto {
  if (integrityStatus === "healthy" || !PROJECTION_BACKED_REPORTS.has(report.reportType)) {
    return integrityStatus === "healthy"
      ? report
      : {
          ...report,
          integrity: "attention",
          diagnostics: [...new Set([...report.diagnostics, "workspace_integrity_attention"])],
        };
  }

  return {
    ...report,
    integrity: "attention",
    diagnostics: [
      ...new Set([
        ...report.diagnostics,
        "workspace_integrity_attention",
        projectionUnavailableDiagnostic,
      ]),
    ],
    totals: { amount: null, quantities: [] },
    page: { items: [], nextCursor: null },
  };
}

function csvHeader(): string {
  return [
    "id",
    "label",
    "sourceType",
    "sourceId",
    "transactionTime",
    "amountMinor",
    "currency",
    "quantityScaled",
    "unit",
    "status",
    "documentHref",
  ]
    .map(csvCell)
    .join(",");
}

export const getOperationalReport = (ctx: CommandContext, input: ReportInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const profile =
        (await repos.workspaces.findOperationalProfile(input.workspaceId)) ??
        defaultWorkspaceOperationalProfile(input.workspaceId);
      const [report, integrity] = await Promise.all([
        repos.reportReads.operational({
          workspaceId: input.workspaceId,
          reportType: input.reportType,
          businessDate: input.businessDate,
          businessDayStartMinute: profile.businessDayStartMinute,
          productId: input.productId,
          unit: input.unit,
          page: toPageQuery(input),
        }),
        repos.operationsReads.integrity(input.workspaceId),
      ]);
      log({
        event: "integrity",
        requestId: currentRequestId(),
        workspaceId: input.workspaceId,
        checkType: "report",
        status: integrity.status,
      });
      return protectReportAgainstIntegrityDrift(report, integrity.status);
    },
  });

export const getOperationalReportCsv = (ctx: CommandContext, input: ReportInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const profile =
        (await repos.workspaces.findOperationalProfile(input.workspaceId)) ??
        defaultWorkspaceOperationalProfile(input.workspaceId);
      const integrity = await repos.operationsReads.integrity(input.workspaceId);
      if (integrity.status !== "healthy" && PROJECTION_BACKED_REPORTS.has(input.reportType)) {
        return csvHeader();
      }

      const rows: OperationalReportDto["page"]["items"] = [];
      let after: ReturnType<typeof decodeCursor> = null;
      do {
        const report = await repos.reportReads.operational({
          workspaceId: input.workspaceId,
          reportType: input.reportType,
          businessDate: input.businessDate,
          businessDayStartMinute: profile.businessDayStartMinute,
          productId: input.productId,
          unit: input.unit,
          page: { after, limit: 100 },
        });
        rows.push(...report.page.items);
        after = report.page.nextCursor === null ? null : decodeCursor(report.page.nextCursor);
      } while (after !== null);
      return [
        csvHeader(),
        ...rows.map((row) =>
          [
            row.id,
            row.label,
            row.sourceType,
            row.sourceId,
            row.transactionTime,
            row.amount?.amountMinor ?? null,
            row.amount?.currency ?? null,
            row.quantity?.valueScaled ?? null,
            row.quantity?.unit ?? null,
            row.status,
            row.documentHref,
          ]
            .map(csvCell)
            .join(","),
        ),
      ].join("\n");
    },
  });
