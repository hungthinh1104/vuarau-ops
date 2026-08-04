"use client";

import type {
  MetricDefinition,
  ManagementIntelligenceDto,
  OperationalReportDto,
  Page,
  PurchaseDto,
  Quantity,
  ReportMetricDefinitionsDto,
  ReportType,
  SaleSummaryDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
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

type OperationalOverviewProps = {
  readonly purchases: QueryLike<Page<PurchaseDto>>;
  readonly sales: QueryLike<Page<SaleSummaryDto>>;
  readonly reports: readonly {
    readonly reportType: ReportType;
    readonly query: QueryLike<OperationalReportDto>;
  }[];
};

export function ReportsView(props: {
  readonly canRead: boolean;
  readonly overview?: OperationalOverviewProps;
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tổng quan vận hành"
        description="Các số liệu làm việc hôm nay, lấy từ nguồn chuẩn và có thể mở ngược về chứng từ."
      />
      {props.overview === undefined ? null : <OperationalOverview {...props.overview} />}
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
      <ManagementSnapshot query={props.intelligence} onRetry={props.onIntelligenceRetry} />
      <MetricCatalog query={props.metrics} onRetry={props.onMetricsRetry} />
    </div>
  );
}

function OperationalOverview(props: OperationalOverviewProps) {
  const report = (type: ReportType) =>
    props.reports.find((item) => item.reportType === type)?.query;
  return (
    <section aria-labelledby="operational-overview-title" className="grid gap-3">
      <div>
        <h2 id="operational-overview-title" className="text-subheading font-semibold">
          Việc và số liệu chính
        </h2>
        <p className="text-body-sm text-ink-muted">
          Đơn mua, nhập hàng, tồn kho, bán hàng, giao hàng còn lại, công nợ và tiền được ưu tiên ở
          đây. Metric nâng cao chỉ xuất hiện phía dưới khi đủ nguồn và policy.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <OverviewListCard query={props.purchases} title="Đơn mua" kind="purchases" />
        <OverviewReportCard
          query={report("inventory_movement_report")}
          title="Đã nhập hàng"
          kind="received"
        />
        <OverviewReportCard
          query={report("inventory_by_product_unit")}
          title="Tồn kho"
          kind="stock"
        />
        <OverviewListCard query={props.sales} title="Đơn bán" kind="sales" />
        <OverviewReportCard
          query={report("outstanding_delivery")}
          title="Còn phải giao"
          kind="outstanding"
        />
        <OverviewReportCard query={report("customer_receivables")} title="Phải thu" kind="amount" />
        <OverviewReportCard query={report("supplier_payables")} title="Phải trả" kind="amount" />
        <OverviewReportCard query={report("cash_balances")} title="Tiền" kind="amount" />
      </div>
    </section>
  );
}

function OverviewListCard(props: {
  readonly query: QueryLike<Page<PurchaseDto> | Page<SaleSummaryDto>>;
  readonly title: string;
  readonly kind: "purchases" | "sales";
}) {
  if (props.query.isPending)
    return <OverviewCardShell title={props.title}>Đang tải…</OverviewCardShell>;
  if (props.query.isError || props.query.data === undefined) {
    return <OverviewCardShell title={props.title}>Chưa tải được dữ liệu</OverviewCardShell>;
  }
  const total = props.query.data.items.reduce((sum, item) => sum + item.totalAmount.amountMinor, 0);
  return (
    <OverviewCardShell title={props.title} status="Đang có dữ liệu">
      <strong className="tabular text-heading text-ink">
        {formatMoney({ amountMinor: total, currency: "VND" })}
      </strong>
      <span className="text-body-sm text-ink-muted">
        {props.query.data.items.length} {props.kind === "purchases" ? "đơn mua" : "đơn bán"} trong
        phạm vi tải hiện tại
      </span>
    </OverviewCardShell>
  );
}

function OverviewReportCard(props: {
  readonly query: QueryLike<OperationalReportDto> | undefined;
  readonly title: string;
  readonly kind: "received" | "stock" | "outstanding" | "amount";
}) {
  if (props.query === undefined || props.query.isPending) {
    return <OverviewCardShell title={props.title}>Đang tải…</OverviewCardShell>;
  }
  if (props.query.isError || props.query.data === undefined) {
    return <OverviewCardShell title={props.title}>Chưa tải được dữ liệu</OverviewCardShell>;
  }
  const report = props.query.data;
  if (report.integrity !== "healthy") {
    return (
      <OverviewCardShell title={props.title} status="Đang khóa số liệu">
        Cần đối chiếu nguồn
      </OverviewCardShell>
    );
  }
  const quantities: Quantity[] =
    props.kind === "received"
      ? report.page.items
          .filter((row) => row.sourceType === "purchase_receipt")
          .reduce<Quantity[]>((all, row) => addQuantity(all, row.quantity), [])
      : [...report.totals.quantities];
  return (
    <OverviewCardShell title={props.title} status="Đã đối chiếu">
      {props.kind === "amount" && report.totals.amount !== null ? (
        <strong className="tabular text-heading text-ink">
          {formatMoney(report.totals.amount)}
        </strong>
      ) : quantities.length > 0 ? (
        quantities.map((quantity) => (
          <strong key={quantity.unit} className="tabular text-heading text-ink">
            {formatQuantity(quantity)}
          </strong>
        ))
      ) : (
        <span className="text-body-sm text-ink-muted">Chưa có dữ liệu</span>
      )}
    </OverviewCardShell>
  );
}

function OverviewCardShell(props: {
  readonly title: string;
  readonly status?: string;
  readonly children: ReactNode;
}) {
  return (
    <article className="grid gap-2 rounded-card border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{props.title}</h3>
        {props.status === undefined ? null : <Badge tone="neutral">{props.status}</Badge>}
      </div>
      {props.children}
    </article>
  );
}

function addQuantity(quantities: readonly Quantity[], quantity: Quantity | null) {
  if (quantity === null) return [...quantities];
  const existing = quantities.find((item) => item.unit === quantity.unit);
  if (existing === undefined) return [...quantities, quantity];
  return quantities.map((item) =>
    item.unit === quantity.unit
      ? { ...item, valueScaled: item.valueScaled + quantity.valueScaled }
      : item,
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
          Các tổng số được chọn bởi policy và lấy lại từ report nguồn; đây không phải COGS, profit,
          forecast, điểm hay đề xuất.
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
                {snapshot.diagnostics.join(", ") || "Thiếu policy hoặc nguồn đối chiếu."}
              </p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.indicators.map((indicator) => {
                const title = REPORT_TYPE_OPTIONS.find(
                  (option) => option.value === indicator.reportType,
                )?.label;
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
                    <p className="text-caption text-ink-muted">
                      Nguồn: report.{indicator.sourceReportType}
                    </p>
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
          className="overflow-x-auto rounded-card border border-border bg-surface shadow-sm"
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
