"use client";

import type {
  DashboardOrderStatusCountsDto,
  DashboardSeriesDto,
  DashboardSummaryDto,
  DashboardTopProductsDto,
  MetricDefinition,
  ManagementIntelligenceDto,
  OperationalReportDto,
  ReportMetricDefinitionsDto,
  ReportType,
} from "@vuarau/domain-contracts";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { copyForReportDiagnostic, copyForReportMetric } from "@/ui/copy.ts";
import { DisclosureSection, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
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
  healthy: "Đã đối chiếu",
  unavailable: "Chưa sẵn sàng",
};

const reportStatusCopy = (value: string): string => REPORT_STATUS_COPY[value] ?? "Cần kiểm tra";

export const REPORT_TYPE_OPTIONS: readonly { value: ReportType; label: string }[] = [
  { value: "customer_account_activity", label: "Biến động công nợ khách hàng" },
  { value: "customer_receivables", label: "Phải thu khách hàng" },
  { value: "supplier_payables", label: "Phải trả nhà cung cấp" },
  { value: "inventory_by_product_unit", label: "Tồn kho theo mặt hàng, hạng hàng và đơn vị" },
  { value: "inventory_movement_report", label: "Biến động tồn kho" },
  { value: "outstanding_delivery", label: "Hàng còn phải giao" },
  { value: "cash_balances", label: "Số dư các tài khoản tiền" },
  { value: "cash_movement_report", label: "Biến động tiền" },
  { value: "expense_report", label: "Chi phí vận hành" },
];

type OperationalOverviewProps = {
  readonly summary: QueryLike<DashboardSummaryDto>;
  readonly series: QueryLike<DashboardSeriesDto>;
  readonly statusCounts: QueryLike<DashboardOrderStatusCountsDto>;
  readonly topProducts: QueryLike<DashboardTopProductsDto>;
  readonly onRetry: () => void;
  readonly advancedOpen?: boolean;
  readonly onAdvancedOpenChange?: (open: boolean) => void;
};

export function ReportsView(props: {
  readonly canRead: boolean;
  readonly overview?: OperationalOverviewProps;
  readonly advancedOpen?: boolean;
  readonly onAdvancedOpenChange?: (open: boolean) => void;
  readonly reportType: ReportType;
  readonly businessDate: string;
  readonly state: "loading" | "ready" | "error";
  readonly result: OperationalReportDto | null;
  readonly metrics: QueryLike<ReportMetricDefinitionsDto>;
  readonly intelligence: QueryLike<ManagementIntelligenceDto>;
  readonly exporting: boolean;
  readonly onReportTypeChange: (value: ReportType) => void;
  readonly onBusinessDateChange: (value: string) => void;
  readonly onExport: () => void;
  readonly onRetry: () => void;
  readonly onMetricsRetry: () => void;
  readonly onIntelligenceRetry: () => void;
  readonly onNextPage: () => void;
}) {
  if (!props.canRead) return <p role="alert">Bạn không có quyền đọc báo cáo.</p>;
  const advancedOpen = props.advancedOpen ?? false;
  const onAdvancedOpenChange = props.onAdvancedOpenChange ?? (() => undefined);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tổng quan vận hành"
        description="Các số liệu làm việc hôm nay, lấy từ nguồn chuẩn và có thể mở ngược về chứng từ."
      />
      {props.overview === undefined ? null : (
        <OperationalOverview
          {...props.overview}
          advancedOpen={advancedOpen}
          onAdvancedOpenChange={onAdvancedOpenChange}
        />
      )}
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
      <DisclosureSection
        title="Chỉ số nâng cao"
        description="Mở khi cần xem biểu đồ, đối chiếu và chỉ số quản lý chi tiết."
        open={advancedOpen}
        onOpenChange={onAdvancedOpenChange}
      >
        <div className="grid gap-6">
          <ManagementSnapshot query={props.intelligence} onRetry={props.onIntelligenceRetry} />
          <MetricCatalog query={props.metrics} onRetry={props.onMetricsRetry} />
        </div>
      </DisclosureSection>
    </div>
  );
}

function OperationalOverview(props: OperationalOverviewProps) {
  const advancedOpen = props.advancedOpen ?? false;
  const onAdvancedOpenChange = props.onAdvancedOpenChange ?? (() => undefined);
  return (
    <section aria-labelledby="operational-overview-title" className="grid gap-3">
      <div>
        <h2 id="operational-overview-title" className="text-subheading font-semibold">
          Việc và số liệu chính
        </h2>
        <p className="text-body-sm text-ink-muted">
          Tổng hợp từ số liệu đã ghi; một chỉ số lỗi chỉ ảnh hưởng đúng phần đó.
        </p>
      </div>
      <DashboardCards query={props.summary} onRetry={props.onRetry} />
      <DisclosureSection
        title="Biểu đồ và mặt hàng nổi bật"
        description="Chỉ tải dữ liệu chi tiết sau khi mở phần này."
        open={advancedOpen}
        onOpenChange={onAdvancedOpenChange}
      >
        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <SalesTrendChart query={props.series} onRetry={props.onRetry} />
          <StatusDistribution query={props.statusCounts} onRetry={props.onRetry} />
        </div>
        <div className="mt-4">
          <TopProducts query={props.topProducts} onRetry={props.onRetry} />
        </div>
      </DisclosureSection>
    </section>
  );
}

function DashboardCards(props: {
  readonly query: QueryLike<DashboardSummaryDto>;
  readonly onRetry: () => void;
}) {
  if (props.query.isPending) return <p role="status">Đang tải tổng quan…</p>;
  if (props.query.isError || props.query.data === undefined)
    return <WidgetUnavailable title="Tổng quan" onRetry={props.onRetry} />;
  const summary = props.query.data;
  return (
    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 xl:grid-cols-4">
      <AmountCard title="Doanh số đã chốt" widget={summary.sales} />
      <AmountCard title="Giá trị đơn mua" widget={summary.purchases} />
      <QuantityCard title="Đã nhận hàng" widget={summary.received} />
      <QuantityCard title="Tồn kho hiện tại" widget={summary.stock} />
      <QuantityCard title="Còn phải giao" widget={summary.outstandingDelivery} />
      <AmountCard title="Phải thu" widget={summary.receivables} />
      <AmountCard title="Phải trả" widget={summary.payables} />
      <AmountCard title="Tiền" widget={summary.cash} />
    </div>
  );
}

function AmountCard(props: {
  readonly title: string;
  readonly widget: DashboardSummaryDto["sales"];
}) {
  return (
    <OverviewCardShell
      title={props.title}
      status={reportStatusCopy(props.widget.availability.state)}
    >
      {props.widget.amount === null ? (
        <strong className="text-heading">N/A</strong>
      ) : (
        <strong className="tabular text-heading text-ink">
          {formatMoney(props.widget.amount)}
        </strong>
      )}
      <span className="text-body-sm text-ink-muted">
        {props.widget.count} bản ghi ·{" "}
        {props.widget.availability.diagnostics.map(copyForReportDiagnostic).join(", ") ||
          "đã cập nhật"}
      </span>
    </OverviewCardShell>
  );
}

function QuantityCard(props: {
  readonly title: string;
  readonly widget: DashboardSummaryDto["received"];
}) {
  return (
    <OverviewCardShell
      title={props.title}
      status={reportStatusCopy(props.widget.availability.state)}
    >
      {props.widget.quantities.length === 0 ? (
        <strong className="text-heading">N/A</strong>
      ) : (
        props.widget.quantities.map((quantity) => (
          <strong key={quantity.unit} className="tabular text-heading text-ink">
            {formatQuantity(quantity)}
          </strong>
        ))
      )}
      <span className="text-body-sm text-ink-muted">
        {props.widget.count} nguồn ·{" "}
        {props.widget.availability.diagnostics.map(copyForReportDiagnostic).join(", ") ||
          "đã cập nhật"}
      </span>
    </OverviewCardShell>
  );
}

function WidgetUnavailable(props: { readonly title: string; readonly onRetry: () => void }) {
  return (
    <OverviewCardShell title={props.title} status="unavailable">
      N/A{" "}
      <Button tone="secondary" onClick={props.onRetry}>
        Thử lại
      </Button>
    </OverviewCardShell>
  );
}

function SalesTrendChart(props: {
  readonly query: QueryLike<DashboardSeriesDto>;
  readonly onRetry: () => void;
}) {
  if (props.query.isPending)
    return <OverviewCardShell title="Doanh số 30 ngày">Đang tải…</OverviewCardShell>;
  if (props.query.isError || props.query.data === undefined)
    return <WidgetUnavailable title="Doanh số 30 ngày" onRetry={props.onRetry} />;
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      aria-labelledby="sales-trend-title"
    >
      <h3 id="sales-trend-title" className="font-semibold">
        Doanh số và đơn bán · 30 ngày
      </h3>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={props.query.data.points}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              formatter={(value) => formatMoney({ amountMinor: Number(value), currency: "VND" })}
            />
            <Line
              type="monotone"
              dataKey="sales.amountMinor"
              name="Doanh số"
              stroke="var(--color-accent)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function StatusDistribution(props: {
  readonly query: QueryLike<DashboardOrderStatusCountsDto>;
  readonly onRetry: () => void;
}) {
  if (props.query.isPending)
    return <OverviewCardShell title="Trạng thái đơn">Đang tải…</OverviewCardShell>;
  if (props.query.isError || props.query.data === undefined)
    return <WidgetUnavailable title="Trạng thái đơn" onRetry={props.onRetry} />;
  const rows = props.query.data.physical.map((row) => ({
    label: reportStatusCopy(row.key),
    count: row.count,
  }));
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      aria-labelledby="status-title"
    >
      <h3 id="status-title" className="font-semibold">
        Trạng thái vật lý
      </h3>
      <div className="mt-4 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={110} />
            <Tooltip />
            <Bar dataKey="count" name="Đơn" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

function TopProducts(props: {
  readonly query: QueryLike<DashboardTopProductsDto>;
  readonly onRetry: () => void;
}) {
  if (props.query.isPending)
    return <OverviewCardShell title="Top mặt hàng">Đang tải…</OverviewCardShell>;
  if (props.query.isError || props.query.data === undefined)
    return <WidgetUnavailable title="Top mặt hàng" onRetry={props.onRetry} />;
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      aria-labelledby="top-products-title"
    >
      <h3 id="top-products-title" className="font-semibold">
        Top mặt hàng theo doanh số
      </h3>
      <div className="mt-3 overflow-x-auto">
        <table className="data-table w-full text-left text-body-sm">
          <thead>
            <tr>
              <th className="p-3">Mặt hàng</th>
              <th className="p-3">Sản lượng</th>
              <th className="p-3">Doanh số</th>
            </tr>
          </thead>
          <tbody>
            {props.query.data.products.map((product) => (
              <tr key={`${product.productId ?? product.productName}:${product.quantity.unit}`}>
                <td className="p-3 font-semibold">{product.productName}</td>
                <td className="p-3">{formatQuantity(product.quantity)}</td>
                <td className="p-3 tabular">{formatMoney(product.sales)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function OverviewCardShell(props: {
  readonly title: string;
  readonly status?: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-2 border-b border-border py-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{props.title}</h3>
        {props.status === undefined ? null : (
          <Badge tone="neutral">{reportStatusCopy(props.status)}</Badge>
        )}
      </div>
      {props.children}
    </div>
  );
}

function ManagementSnapshot(props: {
  readonly query: QueryLike<ManagementIntelligenceDto>;
  readonly onRetry: () => void;
}) {
  return (
    <section aria-labelledby="management-snapshot-title" className="grid gap-3">
      <div>
        <h2 id="management-snapshot-title" className="text-subheading font-semibold">
          Ảnh chụp vận hành
        </h2>
        <p className="text-body-sm text-ink-muted">
          Các tổng số được lấy từ sổ và giao dịch đã ghi; chỉ số nâng cao sẽ chỉ hiện khi đủ dữ liệu
          đối chiếu.
        </p>
      </div>
      <QueryStates
        query={props.query}
        loadingLabel="Đang tải ảnh chụp vận hành"
        attemptedAction="Xem ảnh chụp vận hành"
        onRetry={props.onRetry}
      >
        {(snapshot) =>
          snapshot.status === "unavailable" ? (
            <div
              role="status"
              className="rounded-card border border-warning/30 bg-warning-soft/40 p-4"
            >
              <p className="font-semibold">Ảnh chụp vận hành chưa khả dụng.</p>
              <p className="text-body-sm text-ink-muted">
                {snapshot.diagnostics.map(copyForReportDiagnostic).join(", ") ||
                  "Thiếu dữ liệu đối chiếu."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.indicators.map((indicator) => {
                const title =
                  REPORT_TYPE_OPTIONS.find((option) => option.value === indicator.reportType)
                    ?.label ?? "Báo cáo liên quan";
                return (
                  <article
                    key={indicator.reportType}
                    className="grid gap-2 rounded-card border border-border bg-surface p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{title ?? indicator.reportType}</h3>
                      <Badge tone={indicator.integrity === "healthy" ? "positive" : "warning"}>
                        {indicator.integrity === "healthy" ? "Đã đối chiếu" : "Cần kiểm tra"}
                      </Badge>
                    </div>
                    {indicator.totals.amount !== null ? (
                      <strong className="tabular text-heading text-ink">
                        {formatMoney(indicator.totals.amount)}
                      </strong>
                    ) : null}
                    {indicator.totals.quantities.map((quantity) => (
                      <span key={quantity.unit} className="tabular text-body-sm text-ink">
                        {formatQuantity(quantity)}
                      </span>
                    ))}
                    <p className="text-caption text-ink-muted">Dữ liệu đã đối chiếu</p>
                  </article>
                );
              })}
            </div>
          )
        }
      </QueryStates>
    </section>
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
          Chỉ số quản lý
        </h2>
        <p className="text-body-sm text-ink-muted">
          Chỉ số chỉ hiện khi đủ dữ liệu và đối chiếu. Mục chưa đủ dữ liệu sẽ được báo rõ thay vì
          hiện số 0.
        </p>
      </div>
      <QueryStates
        query={props.query}
        loadingLabel="Đang tải danh sách chỉ số quản lý"
        attemptedAction="Xem danh sách chỉ số quản lý"
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
  const copy = copyForReportMetric(definition.metricId);
  if (definition.availability === "unavailable") {
    return (
      <li className="grid gap-2 rounded-card border border-warning/30 bg-warning-soft/40 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-semibold">{copy.label}</h3>
          <Badge tone="warning">Chưa khả dụng</Badge>
        </div>
        <p className="text-body-sm text-ink">{copy.description}</p>
        <p className="text-caption text-ink-muted">Điều kiện: {copy.condition}</p>
        <p className="text-caption text-ink-muted">Bước tiếp theo: {copy.nextStep}</p>
      </li>
    );
  }

  return (
    <li className="grid gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-semibold">{copy.label}</h3>
        <Badge tone={definition.availability === "available" ? "positive" : "info"}>
          {definition.availability === "available" ? "Đang có" : "Có cảnh báo"}
        </Badge>
      </div>
      <p className="text-body-sm">{copy.formula}</p>
      <p className="text-caption text-ink-muted">Dữ liệu: {copy.sources}</p>
      <p className="text-caption text-ink-muted">
        Chi tiết: {copy.drilldown} · việc tiếp theo: {copy.action}
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
            {copyForReportDiagnostic(diagnostic)}
          </p>
        ))}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {result.totals.amount !== null ? (
            <a
              href="#report-sources"
              className="rounded-card border border-border bg-surface-muted p-3 hover:border-border-strong"
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
              className="rounded-card border border-border bg-surface-muted p-3 hover:border-border-strong"
            >
              <span className="block text-caption text-ink-muted">
                Tổng tất cả hạng hàng · {quantity.unit}
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
          <table className="data-table w-full min-w-[760px] text-left text-body-sm">
            <colgroup>
              <col className="w-[32%]" />
              <col className="w-[25%]" />
              <col className="w-[20%]" />
              <col className="w-[13%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="p-3">Nguồn</th>
                <th className="p-3">Hạng hàng</th>
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
                  <td className="p-3">{REPORT_STATUS_COPY[row.status] ?? "Cần kiểm tra"}</td>
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
