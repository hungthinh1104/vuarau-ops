import {
  decodeCursor,
  type OperationalReportDto,
  type ReportInput,
} from "@vuarau/domain-contracts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPageQuery } from "../shared/read-pipeline.ts";
import { currentRequestId, log } from "../../infrastructure/logging.ts";
import { csvCell } from "./csv.ts";

export const getOperationalReport = (ctx: CommandContext, input: ReportInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const [report, integrity] = await Promise.all([
        repos.reportReads.operational({
          workspaceId: input.workspaceId,
          reportType: input.reportType,
          businessDate: input.businessDate,
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
      if (integrity.status === "healthy") return report;
      return {
        ...report,
        integrity: "attention" as const,
        diagnostics: [...new Set([...report.diagnostics, "workspace_integrity_attention"])],
      };
    },
  });

export const getOperationalReportCsv = (ctx: CommandContext, input: ReportInput) =>
  runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "report.read",
    execute: async ({ repos }) => {
      const rows: OperationalReportDto["page"]["items"] = [];
      let after: ReturnType<typeof decodeCursor> = null;
      do {
        const report = await repos.reportReads.operational({
          workspaceId: input.workspaceId,
          reportType: input.reportType,
          businessDate: input.businessDate,
          productId: input.productId,
          unit: input.unit,
          page: { after, limit: 100 },
        });
        rows.push(...report.page.items);
        after = report.page.nextCursor === null ? null : decodeCursor(report.page.nextCursor);
      } while (after !== null);
      const header = [
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
      ];
      return [
        header.map(csvCell).join(","),
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
