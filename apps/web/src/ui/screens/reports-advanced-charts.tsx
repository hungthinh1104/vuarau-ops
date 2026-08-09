"use client";

import type {
  DashboardOrderStatusCountsDto,
  DashboardSeriesDto,
  DashboardTopProductsDto,
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
import { copyForReportDiagnostic, copyForReportStatus } from "@/ui/copy.ts";
import { formatMoney, formatQuantity } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export type AdvancedDashboardChartsProps = {
  readonly series: QueryLike<DashboardSeriesDto>;
  readonly statusCounts: QueryLike<DashboardOrderStatusCountsDto>;
  readonly topProducts: QueryLike<DashboardTopProductsDto>;
  readonly onRetry: () => void;
};

export function AdvancedDashboardCharts(props: AdvancedDashboardChartsProps) {
  return (
    <>
      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <SalesTrendChart query={props.series} onRetry={props.onRetry} />
        <StatusDistribution query={props.statusCounts} onRetry={props.onRetry} />
      </div>
      <div className="mt-4">
        <TopProducts query={props.topProducts} onRetry={props.onRetry} />
      </div>
    </>
  );
}

function SalesTrendChart(props: {
  readonly query: QueryLike<DashboardSeriesDto>;
  readonly onRetry: () => void;
}) {
  if (props.query.isPending)
    return <ChartPlaceholder title="Doanh số 30 ngày">Đang tải…</ChartPlaceholder>;
  if (props.query.isError || props.query.data === undefined)
    return <ChartUnavailable title="Doanh số 30 ngày" onRetry={props.onRetry} />;
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
    return <ChartPlaceholder title="Trạng thái đơn">Đang tải…</ChartPlaceholder>;
  if (props.query.isError || props.query.data === undefined)
    return <ChartUnavailable title="Trạng thái đơn" onRetry={props.onRetry} />;
  const rows = props.query.data.physical.map((row) => ({
    label: copyForReportStatus(row.key),
    count: row.count,
  }));
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      aria-labelledby="status-title"
    >
      <h3 id="status-title" className="font-semibold">
        Trạng thái đơn
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
    return <ChartPlaceholder title="Mặt hàng bán chạy">Đang tải…</ChartPlaceholder>;
  if (props.query.isError || props.query.data === undefined)
    return <ChartUnavailable title="Mặt hàng bán chạy" onRetry={props.onRetry} />;
  return (
    <section
      className="rounded-card border border-border bg-surface p-4"
      aria-labelledby="top-products-title"
    >
      <h3 id="top-products-title" className="font-semibold">
        Mặt hàng bán chạy
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

function ChartPlaceholder({
  title,
  children,
}: {
  readonly title: string;
  readonly children: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Badge tone="neutral">Đang tải</Badge>
      </div>
      <p role="status" className="mt-4 text-body-sm text-ink-muted">
        {children}
      </p>
    </section>
  );
}

function ChartUnavailable({
  title,
  onRetry,
}: {
  readonly title: string;
  readonly onRetry: () => void;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4" aria-label={title}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">{title}</h3>
        <Badge tone="neutral">{copyForReportStatus("unavailable")}</Badge>
      </div>
      <p className="mt-3 text-body-sm text-ink-muted">
        {copyForReportDiagnostic("projection_unavailable")}
      </p>
      <Button className="mt-3" tone="secondary" onClick={onRetry}>
        Thử lại
      </Button>
    </section>
  );
}
