"use client";

import { useQueries, useQuery } from "@tanstack/react-query";
import type { Cursor, ReportType } from "@vuarau/domain-contracts";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { ReportsView } from "@/ui/screens/reports-view.tsx";

const OPERATIONAL_OVERVIEW_REPORTS = [
  "customer_receivables",
  "supplier_payables",
  "inventory_by_product_unit",
  "inventory_movement_report",
  "outstanding_delivery",
  "cash_balances",
] as const satisfies readonly ReportType[];

export function ReportsController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const metricDefinitions = useQuery(trpc.report.metrics.queryOptions({ workspaceId }));
  const overviewReports = useQueries({
    queries: OPERATIONAL_OVERVIEW_REPORTS.map((reportType) =>
      trpc.report.operational.queryOptions({
        workspaceId,
        reportType,
        businessDate: null,
        productId: null,
        unit: null,
        cursor: null,
        limit: 100,
      }),
    ),
  });
  const purchases = useQuery(
    trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: null,
      cursor: null,
      limit: 100,
    }),
  );
  const sales = useQuery(
    trpc.sale.list.queryOptions({
      workspaceId,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
      cursor: null,
      limit: 100,
    }),
  );
  const [asOf] = useState(() => new Date().toISOString());
  const [reportType, setReportType] = useState<ReportType>("customer_account_activity");
  const [businessDate, setBusinessDate] = useState("");
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const input = useMemo(
    () => ({
      workspaceId,
      reportType,
      businessDate:
        ["customer_account_activity", "cash_movement_report", "expense_report"].includes(
          reportType,
        ) && businessDate
          ? businessDate
          : null,
      productId: null,
      unit: null,
      cursor,
      limit: 50,
    }),
    [businessDate, cursor, reportType, workspaceId],
  );
  const report = useQuery(trpc.report.operational.queryOptions(input));
  const intelligence = useQuery(
    trpc.report.intelligence.queryOptions({
      workspaceId,
      asOf,
      businessDate: businessDate || null,
    }),
  );
  const csv = useQuery({
    ...trpc.report.csv.queryOptions({ ...input, cursor: null, limit: 100 }),
    enabled: false,
  });
  useEffect(() => {
    if (csv.data === undefined) return;
    const url = URL.createObjectURL(new Blob([csv.data], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${reportType}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [csv.data, reportType]);
  return (
    <ReportsView
      canRead={session.permissions.includes("report.read")}
      overview={{
        purchases,
        sales,
        reports: overviewReports.map((query, index) => ({
          reportType: OPERATIONAL_OVERVIEW_REPORTS[index]!,
          query,
        })),
      }}
      reportType={reportType}
      businessDate={businessDate}
      state={report.isPending ? "loading" : report.isError ? "error" : "ready"}
      result={report.data ?? null}
      metrics={metricDefinitions}
      intelligence={intelligence}
      exporting={csv.isFetching}
      onReportTypeChange={(value) => {
        setReportType(value);
        setCursor(null);
      }}
      onBusinessDateChange={(value) => {
        setBusinessDate(value);
        setCursor(null);
      }}
      onExport={() => void csv.refetch()}
      onRetry={() => void report.refetch()}
      onMetricsRetry={() => void metricDefinitions.refetch()}
      onIntelligenceRetry={() => void intelligence.refetch()}
      onNextPage={() => {
        const next = report.data?.page.nextCursor ?? null;
        if (next !== null) setCursor(next);
      }}
    />
  );
}
