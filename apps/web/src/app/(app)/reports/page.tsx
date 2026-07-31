"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, ReportType } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

const REPORT_STATUS_COPY: Readonly<Record<string, string>> = {
  canonical: "Nguồn chuẩn",
  receivable: "Phải thu",
  payable: "Phải trả",
  negative: "Âm · cần kiểm tra",
  zero: "Bằng 0",
  positive: "Dương",
  outstanding: "Chưa hoàn tất",
};

const TYPES: readonly { value: ReportType; label: string }[] = [
  { value: "customer_account_activity", label: "Biến động công nợ khách hàng" },
  { value: "customer_receivables", label: "Phải thu khách hàng" },
  { value: "supplier_payables", label: "Phải trả nhà cung cấp" },
  { value: "inventory_by_product_unit", label: "Tồn kho theo mặt hàng và đơn vị" },
  { value: "inventory_movement_report", label: "Biến động tồn kho" },
  { value: "outstanding_delivery", label: "Hàng còn phải giao" },
];

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
        reportType === "customer_account_activity" && businessDate ? businessDate : null,
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

  if (!session.permissions.includes("report.read"))
    return <p role="alert">Bạn không có quyền đọc báo cáo.</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Báo cáo"
        description="Đọc số liệu vận hành từ dữ liệu nguồn và đi thẳng tới chứng từ tạo ra con số."
      />
      <div className="grid gap-3 border-y border-border py-4 md:grid-cols-3 md:items-end">
        <Select
          label="Loại báo cáo"
          options={TYPES}
          value={reportType}
          onChange={(event) => {
            setReportType(event.target.value as ReportType);
            setCursor(null);
          }}
        />
        {reportType === "customer_account_activity" ? (
          <label className="grid gap-2">
            <span>Ngày nghiệp vụ · Asia/Ho_Chi_Minh</span>
            <input
              type="date"
              className={INPUT_CLASS}
              value={businessDate}
              onChange={(event) => {
                setBusinessDate(event.target.value);
                setCursor(null);
              }}
            />
          </label>
        ) : null}
        <Button tone="secondary" onClick={() => void csv.refetch()}>
          Xuất CSV
        </Button>
      </div>
      <QueryStates
        query={report}
        loadingLabel="Đang dựng báo cáo"
        onRetry={() => void report.refetch()}
      >
        {(result) => (
          <>
            <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                    Kết quả hiện tại
                  </p>
                  <h2 className="text-subheading font-semibold">
                    {TYPES.find((type) => type.value === result.reportType)?.label}
                  </h2>
                </div>
                <Badge tone={result.integrity === "healthy" ? "positive" : "warning"}>
                  {result.integrity === "healthy" ? "Đã đối chiếu" : "Cần kiểm tra"}
                </Badge>
              </div>
              {result.diagnostics.map((diagnostic) => (
                <p
                  key={diagnostic}
                  role="alert"
                  className="rounded-input bg-warning-soft px-3 py-2 text-body-sm text-warning"
                >
                  {diagnostic}
                </p>
              ))}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {result.totals.amount !== null ? (
                  <a
                    href="#report-sources"
                    className="rounded-card border border-border bg-surface-muted/50 p-3 hover:border-border-strong"
                  >
                    <span className="block text-caption text-ink-muted">Tổng giá trị</span>
                    <strong className="tabular mt-1 block text-heading text-ink">
                      {formatMoney(result.totals.amount)}
                    </strong>
                  </a>
                ) : null}
                {result.totals.quantities.map((quantity) => (
                  <a
                    key={quantity.unit}
                    href="#report-sources"
                    className="rounded-card border border-border bg-surface-muted/50 p-3 hover:border-border-strong"
                  >
                    <span className="block text-caption text-ink-muted">Tổng số lượng</span>
                    <strong className="tabular mt-1 block text-heading text-ink">
                      {formatQuantity({ valueScaled: quantity.valueScaled, unit: quantity.unit })}
                    </strong>
                  </a>
                ))}
              </div>
            </section>
            <div
              id="report-sources"
              className="overflow-x-auto rounded-card border border-border bg-surface"
            >
              <table className="w-full text-left text-body-sm">
                <thead className="sticky top-16 z-10 bg-surface-muted text-label">
                  <tr>
                    <th className="p-3">Nguồn</th>
                    <th className="p-3">Thời điểm</th>
                    <th className="p-3 text-right">Giá trị</th>
                    <th className="p-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody>
                  {result.page.items.map((row) => (
                    <tr key={row.id} className="border-t border-border">
                      <td className="p-3">
                        {row.documentHref === null ? (
                          row.label
                        ) : (
                          <Link
                            href={row.documentHref}
                            className="font-semibold text-info underline-offset-4 hover:underline"
                          >
                            {row.label}
                          </Link>
                        )}
                      </td>
                      <td className="p-3">
                        {row.transactionTime === null ? "—" : formatInstant(row.transactionTime)}
                      </td>
                      <td className="tabular p-3 text-right">
                        {row.amount !== null
                          ? formatMoney(row.amount)
                          : row.quantity !== null
                            ? formatQuantity(row.quantity)
                            : "—"}
                      </td>
                      <td className="p-3">{REPORT_STATUS_COPY[row.status] ?? row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.page.nextCursor !== null ? (
              <Button tone="secondary" onClick={() => setCursor(result.page.nextCursor)}>
                Trang sau
              </Button>
            ) : null}
          </>
        )}
      </QueryStates>
    </div>
  );
}
