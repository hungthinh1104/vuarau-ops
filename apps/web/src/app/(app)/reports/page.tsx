"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, ReportType } from "@vuarau/domain-contracts";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { ReportsView } from "@/ui/screens/reports-view.tsx";

export default function ReportsPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
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
      reportType={reportType}
      businessDate={businessDate}
      state={report.isPending ? "loading" : report.isError ? "error" : "ready"}
      result={report.data ?? null}
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
      onNextPage={() => {
        const next = report.data?.page.nextCursor ?? null;
        if (next !== null) setCursor(next);
      }}
    />
  );
}
