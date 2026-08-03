"use client";

import type {
  MetricDefinition,
  OperationalReportDto,
  ReportMetricDefinitionsDto,
  ReportType,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";

const REPORT_STATUS_COPY: Readonly<Record<string, string>> = {
  canonical: "Nguồn chuẩn",
  receivable: "Phải thu",
  payable: "Phải trả",
  negative: "Âm · cần kiểm tra",
  zero: "Bằng 0",
  positive: "Dương",
  outstanding: "Chưa hoàn tất",
  active: "Đang hoạt động",
  inactive: "Ngừng sử dụng",
  cash_in: "Tiền vào",
  cash_out: "Tiền ra",
  expense: "Chi phí",
};

export const REPORT_TYPE_OPTIONS: readonly { value: ReportType; label: string }[] = [
  { value: "customer_account_activity", label: "Biến động công nợ khách hàng" },
  { value: "customer_receivables", label: "Phải thu khách hàng" },
  { value: "supplier_payables", label: "Phải trả nhà cung cấp" },
  { value: "inventory_by_product_unit", label: "Tồn kho theo mặt hàng, phẩm cấp và đơn vị" },
  { value: "inventory_movement_report", label: "Biến động tồn kho" },
  { value: "outstanding_delivery", label: "Hàng còn phải giao" },
  { value: "cash_balances", label: "Số dư các tài khoản tiền" },
  { value: "cash_movement_report", label: "Biến động tiền" },
  { value: "expense_report", label: "Chi phí vận hành" },
];

export function ReportsView(props: {
  readonly canRead: boolean;
  readonly reportType: ReportType;
  readonly businessDate: string;
  readonly state: "loading" | "ready" | "error";
  readonly result: OperationalReportDto | null;
  readonly metrics: QueryLike<ReportMetricDefinitionsDto>;
  readonly exporting: boolean;
  readonly onReportTypeChange: (value: ReportType) => void;
  readonly onBusinessDateChange: (value: string) => void;
  readonly onExport: () => void;
  readonly onRetry: () => void;
  readonly onMetricsRetry: () => void;
  readonly onNextPage: () => void;
}) {
  if (!props.canRead) return <p role="alert">Bạn không có quyền đọc báo cáo.</p>;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Báo cáo"
        description="Đọc số liệu từ dữ liệu nguồn; mọi con số vận hành phải quay lại được chứng từ tạo ra nó."
      />
      <MetricCatalog query={props.metrics} onRetry={props.onMetricsRetry} />
      <div className="grid gap-3 border-y border-border py-4 md:grid-cols-3 md:items-end">
        <Select
          label="Loại báo cáo"
          options={REPORT_TYPE_OPTIONS}
          value={props.reportType}
          onChange={(event) => props.onReportTypeChange(event.target.value as ReportType)}
        />
        {["customer_account_activity", "cash_movement_report", "expense_report"].includes(
          props.reportType,
        ) ? (
          <label className="grid gap-2">
            <span>Ngày nghiệp vụ · Asia/Ho_Chi_Minh</span>
            <Input
              type="date"
              value={props.businessDate}
              onChange={(event) => props.onBusinessDateChange(event.target.value)}
            />
          </label>
        ) : null}
        <Button tone="secondary" disabled={props.exporting} onClick={props.onExport}>
          {props.exporting ? "Đang xuất…" : "Xuất CSV"}
        </Button>
      </div>

      {props.state === "loading" ? (
        <p className="text-body-sm text-ink-muted">Đang dựng báo cáo từ nguồn chuẩn…</p>
      ) : props.state === "error" || props.result === null ? (
        <div role="alert" className="rounded-card border border-danger/30 p-4 text-body-sm">
          <p>Không dựng được báo cáo. Không hiển thị tổng cũ như thể là dữ liệu hiện tại.</p>
          <Button className="mt-3" tone="secondary" onClick={props.onRetry}>
            Thử lại
          </Button>
        </div>
      ) : (
        <ReportResult result={props.result} onNextPage={props.onNextPage} />
      )}
    </div>
  );
}

function MetricCatalog(props: {
  readonly query: QueryLike<ReportMetricDefinitionsDto>;
  readonly onRetry: () => void;
}) {
  return (
    <section aria-labelledby="metric-catalog-title" className="grid gap-3">
      <div>
        <h2 id="metric-catalog-title" className="text-subheading font-semibold">
          Metric quản trị
        </h2>
        <p className="text-body-sm text-ink-muted">
          Chỉ metric có đủ policy, nguồn chuẩn và integrity contract mới được phép có số. Các mục
          chưa đủ evidence hiện rõ gate thay vì hiện số 0.
        </p>
      </div>
      <QueryStates
        query={props.query}
        loadingLabel="Đang tải catalog metric"
        attemptedAction="Xem catalog metric quản trị"
        onRetry={props.onRetry}
      >
        {(catalog) => (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {catalog.definitions.map((definition) => (
              <MetricCard key={definition.metricId} definition={definition} />
            ))}
          </ul>
        )}
      </QueryStates>
    </section>
  );
}

function MetricCard({ definition }: { readonly definition: MetricDefinition }) {
  if (definition.availability === "unavailable") {
    return (
      <li className="grid gap-2 rounded-card border border-warning/30 bg-warning-soft/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold">{definition.label}</h3>
          <Badge tone="warning">Chưa khả dụng</Badge>
        </div>
        <p className="text-body-sm text-ink">{definition.reason}</p>
        <p className="text-caption text-ink-muted">
          Gate: <strong>{definition.blockedBy.join(", ")}</strong>
        </p>
        <p className="text-caption text-ink-muted">Evidence tiếp theo: {definition.nextEvidence}</p>
      </li>
    );
  }

  return (
    <li className="grid gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{definition.label}</h3>
        <Badge tone={definition.availability === "available" ? "positive" : "info"}>
          {definition.availability === "available" ? "Đang có" : "Có cảnh báo"}
        </Badge>
      </div>
      <p className="text-body-sm">{definition.formula}</p>
      <p className="text-caption text-ink-muted">
        Nguồn: {definition.canonicalSources.join(", ")} · integrity: {definition.integrity}
      </p>
      <p className="text-caption text-ink-muted">
        Drill-down: {definition.drilldown} · hành động: {definition.action}
      </p>
    </li>
  );
}

function ReportResult(props: {
  readonly result: OperationalReportDto;
  readonly onNextPage: () => void;
}) {
  const { result } = props;
  const title = REPORT_TYPE_OPTIONS.find((type) => type.value === result.reportType)?.label;
  const projectionUnavailable = result.diagnostics.includes("report_projection_unavailable");
  return (
    <>
      <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
              Kết quả hiện tại
            </p>
            <h2 className="text-subheading font-semibold">{title}</h2>
          </div>
          <Badge tone={result.integrity === "healthy" ? "positive" : "warning"}>
            {result.integrity === "healthy"
              ? "Đã đối chiếu"
              : projectionUnavailable
                ? "Đang khóa số liệu"
                : "Cần kiểm tra"}
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
              <span className="block text-caption text-ink-muted">
                Tổng tất cả phẩm cấp · {quantity.unit}
              </span>
              <strong className="tabular mt-1 block text-heading text-ink">
                {formatQuantity({ valueScaled: quantity.valueScaled, unit: quantity.unit })}
              </strong>
            </a>
          ))}
        </div>
      </section>

      {projectionUnavailable ? (
        <div
          role="alert"
          className="rounded-card border border-warning/30 bg-warning-soft p-4 text-body-sm text-warning"
        >
          Báo cáo đang khóa vì projection chưa đối chiếu được với dữ liệu nguồn. Không hiển thị số
          cũ; hãy đối chiếu hoặc rebuild projection rồi thử lại.
        </div>
      ) : result.page.items.length === 0 ? (
        <EmptyState
          title="Không có dòng phù hợp"
          description="Báo cáo không tự tạo số 0 giả; thay đổi bộ lọc hoặc kiểm tra dữ liệu nguồn."
        />
      ) : (
        <div
          id="report-sources"
          className="overflow-x-auto rounded-card border border-border bg-surface"
        >
          <table className="data-table min-w-[820px] text-left text-body-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted text-label">
              <tr>
                <th className="p-3">Nguồn</th>
                <th className="p-3">Phẩm cấp</th>
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
                  <td className="p-3 text-ink-muted">
                    {row.productId === null
                      ? "—"
                      : (row.qualityGradeName ?? "Chưa phân hạng · dữ liệu lịch sử")}
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
      )}
      {result.page.nextCursor !== null ? (
        <Button tone="secondary" onClick={props.onNextPage}>
          Trang sau
        </Button>
      ) : null}
    </>
  );
}
