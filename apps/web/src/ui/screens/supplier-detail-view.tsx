"use client";

import type {
  Page,
  SupplierAccountBalanceDto,
  SupplierAccountEntryDto,
  SupplierDto,
  SupplierPriceHistoryRowDto,
  SupplierPerformanceDto,
  SupplierReconciliationDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import Link from "next/link";
import { formatInstant, formatMoney, formatQuantity, formatSignedMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

const RECONCILIATION_STATUS_COPY = {
  consistent: "Đã đối chiếu",
  inconsistent: "Có sai lệch",
  not_found: "Chưa có sổ",
  integrity_failure: "Dữ liệu cần kiểm tra",
} as const;

export type SupplierDetailViewProps = {
  readonly query: QueryLike<SupplierDto>;
  readonly balance: QueryLike<SupplierAccountBalanceDto | null>;
  readonly reconciliation: QueryLike<SupplierReconciliationDto>;
  readonly performance: QueryLike<SupplierPerformanceDto>;
  readonly timeline: QueryLike<Page<SupplierAccountEntryDto>>;
  readonly entries: readonly SupplierAccountEntryDto[];
  readonly nextCursor: string | null;
  readonly timelineFetching: boolean;
  readonly priceHistory: QueryLike<Page<SupplierPriceHistoryRowDto>>;
  readonly priceHistoryItems: readonly SupplierPriceHistoryRowDto[];
  readonly priceHistoryNextCursor: string | null;
  readonly priceHistoryFetching: boolean;
  readonly canUpdate: boolean;
  readonly canCreatePurchase: boolean;
  readonly canReadAccount: boolean;
  readonly moneyActions: (supplier: SupplierDto) => ReactNode;
  readonly onRetry: () => void;
  readonly onBalanceRetry: () => void;
  readonly onReconciliationRetry: () => void;
  readonly onPerformanceRetry: () => void;
  readonly onTimelineRetry: () => void;
  readonly onPriceHistoryRetry: () => void;
  readonly onLoadMore: () => void;
  readonly onPriceHistoryLoadMore: () => void;
};

export function SupplierDetailView(props: SupplierDetailViewProps) {
  return (
    <QueryStates query={props.query} loadingLabel="Đang tải nhà cung cấp" onRetry={props.onRetry}>
      {(record) => (
        <div className="flex max-w-4xl flex-col gap-6">
          <PageHeader
            title={record.displayName}
            description={record.phone ?? "Không có số điện thoại"}
            back={{ href: "/suppliers", label: "Nhà cung cấp" }}
            status={
              <Badge tone={record.isActive ? "positive" : "neutral"}>
                {record.isActive ? "Đang hoạt động" : "Đã ngưng"}
              </Badge>
            }
          />
          {record.note === null ? null : <p>{record.note}</p>}
          <div className="flex flex-wrap gap-2">
            {props.canUpdate ? (
              <LinkButton tone="secondary" href={`/suppliers/${record.id}/edit`}>
                Sửa hồ sơ
              </LinkButton>
            ) : null}
            {props.canCreatePurchase && record.isActive ? (
              <LinkButton href={`/purchases/new?supplierId=${record.id}`}>Tạo đơn mua</LinkButton>
            ) : null}
          </div>
          <QueryStates
            query={props.performance}
            loadingLabel="Đang dựng hiệu quả nhà cung cấp"
            onRetry={props.onPerformanceRetry}
          >
            {(performance) => <SupplierPerformanceSection performance={performance} />}
          </QueryStates>
          <section aria-labelledby="supplier-price-history-title" className="flex flex-col gap-3">
            <div>
              <h2 id="supplier-price-history-title" className="text-subheading font-semibold">
                Lịch sử giá mua đã chốt
              </h2>
              <p className="text-caption text-ink-muted">
                Giá quan sát từ các dòng đơn mua đã xác nhận; không phải giá đề xuất hay xếp hạng.
              </p>
            </div>
            <QueryStates
              query={props.priceHistory}
              loadingLabel="Đang tải lịch sử giá mua"
              onRetry={props.onPriceHistoryRetry}
            >
              {() =>
                props.priceHistoryItems.length === 0 ? (
                  <p>Chưa có dòng mua đã chốt.</p>
                ) : (
                  <div className="overflow-x-auto rounded-card border border-border bg-surface shadow-sm">
                    <table className="data-table min-w-full text-body-sm">
                      <caption className="sr-only">Lịch sử giá mua đã chốt</caption>
                      <thead className="sticky top-0 z-10">
                        <tr>
                          <th scope="col" className="px-4 py-3 font-medium">
                            Mặt hàng
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            Số lượng
                          </th>
                          <th scope="col" className="px-4 py-3 text-right font-medium">
                            Đơn giá
                          </th>
                          <th scope="col" className="px-4 py-3 text-right font-medium">
                            Thành tiền
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            Ngày chốt
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {props.priceHistoryItems.map((row) => (
                          <tr key={row.purchaseLineId}>
                            <th scope="row" className="px-4 py-3 text-left font-semibold">
                              <Link
                                href={`/purchases/${row.purchaseId}`}
                                className="text-info underline-offset-4 hover:underline"
                              >
                                {row.productName}
                              </Link>
                            </th>
                            <td className="px-4 py-3">{formatQuantity(row.quantity)}</td>
                            <td className="px-4 py-3 text-right">{formatMoney(row.unitPrice)}</td>
                            <td className="px-4 py-3 text-right">{formatMoney(row.lineTotal)}</td>
                            <td className="px-4 py-3">{formatInstant(row.confirmedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              }
            </QueryStates>
            {props.priceHistoryNextCursor === null ? null : (
              <Button
                tone="secondary"
                disabled={props.priceHistoryFetching}
                onClick={props.onPriceHistoryLoadMore}
              >
                {props.priceHistoryFetching ? "Đang tải" : "Tải thêm lịch sử giá"}
              </Button>
            )}
          </section>
          {props.canReadAccount ? (
            <>
              <QueryStates
                query={props.balance}
                loadingLabel="Đang tải công nợ"
                onRetry={props.onBalanceRetry}
              >
                {(summary) => (
                  <section className="rounded-card border border-border bg-surface p-4">
                    <h2 className="text-subheading font-semibold">Công nợ nhà cung cấp</h2>
                    <p className="text-heading font-bold">
                      {summary === null
                        ? formatMoney({ amountMinor: 0, currency: "VND" })
                        : formatMoney(summary.balance)}
                    </p>
                    <p className="text-caption text-ink-muted">
                      {summary?.classification === "supplier_credit"
                        ? "Nhà cung cấp đang giữ tiền ứng trước"
                        : summary?.classification === "payable"
                          ? "Vựa đang phải trả"
                          : "Đã cân bằng"}
                    </p>
                  </section>
                )}
              </QueryStates>
              {props.moneyActions(record)}
              <QueryStates
                query={props.reconciliation}
                loadingLabel="Đang đối chiếu"
                onRetry={props.onReconciliationRetry}
              >
                {(result) => (
                  <p role="status" className="text-body-sm">
                    Đối chiếu: <strong>{RECONCILIATION_STATUS_COPY[result.status]}</strong>
                    {result.diagnostics.length === 0 ? "" : ` · ${result.diagnostics.join(", ")}`}
                  </p>
                )}
              </QueryStates>
              <section aria-labelledby="supplier-timeline-title" className="flex flex-col gap-3">
                <h2 id="supplier-timeline-title" className="text-subheading font-semibold">
                  Dòng thời gian công nợ
                </h2>
                <QueryStates
                  query={props.timeline}
                  loadingLabel="Đang tải sổ công nợ"
                  onRetry={props.onTimelineRetry}
                >
                  {() =>
                    props.entries.length === 0 ? (
                      <p>Chưa có phát sinh.</p>
                    ) : (
                      <ol className="divide-y divide-border rounded-card border border-border bg-surface">
                        {props.entries.map((entry) => {
                          const href = sourceHref(entry);
                          return (
                            <li key={entry.id} className="px-4 py-3">
                              <div className="flex justify-between gap-3">
                                <span>{entry.sourceType.replaceAll("_", " ")}</span>
                                <strong>{formatSignedMoney(entry.amount)}</strong>
                              </div>
                              <p className="text-caption text-ink-muted">
                                {formatInstant(entry.transactionTime)}
                                {entry.recordedAt === entry.transactionTime
                                  ? ""
                                  : ` · ghi ${formatInstant(entry.recordedAt)}`}
                              </p>
                              {entry.reason === null ? null : <p>{entry.reason}</p>}
                              {href === null ? null : (
                                <Link
                                  href={href}
                                  className="font-semibold text-info underline-offset-4 hover:underline"
                                >
                                  Mở chứng từ
                                </Link>
                              )}
                            </li>
                          );
                        })}
                      </ol>
                    )
                  }
                </QueryStates>
                {props.nextCursor === null ? null : (
                  <Button
                    tone="secondary"
                    disabled={props.timelineFetching}
                    onClick={props.onLoadMore}
                  >
                    {props.timelineFetching ? "Đang tải" : "Tải thêm"}
                  </Button>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </QueryStates>
  );
}

function SupplierPerformanceSection({
  performance,
}: {
  readonly performance: SupplierPerformanceDto;
}) {
  return (
    <section
      aria-labelledby="supplier-performance-title"
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <div>
        <h2 id="supplier-performance-title" className="text-subheading font-semibold">
          Hiệu quả nhà cung cấp
        </h2>
        <p className="text-caption text-ink-muted">
          Tóm tắt dữ kiện giao, nhận và thời gian theo policy đã duyệt; không phải điểm xếp hạng hay
          đề xuất mua hàng.
        </p>
      </div>
      {performance.status === "unavailable" ? (
        <div role="status" className="rounded-input bg-warning-soft px-3 py-2 text-body-sm">
          <p>Chưa có kết quả hiệu quả nhà cung cấp.</p>
          <p className="text-caption text-ink-muted">
            {performance.diagnostics.join(", ") || "Nguồn dữ kiện chưa đủ để tính."}
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <PerformanceValue
              label="Quan sát dùng được"
              value={String(performance.measurementObservationCount)}
            />
            <PerformanceValue
              label="Đúng hẹn"
              value={
                performance.timing === null
                  ? "Chưa có số"
                  : `${performance.timing.onTimeCount}/${performance.timing.measuredCount}`
              }
            />
            <PerformanceValue
              label="Trễ hẹn"
              value={
                performance.timing === null ? "Chưa có số" : String(performance.timing.lateCount)
              }
            />
          </div>
          {performance.quantityMetrics.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Chưa có dữ kiện số lượng đủ cùng đơn vị.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-border">
              <table className="data-table min-w-full text-body-sm">
                <caption className="sr-only">Dữ kiện số lượng nhà cung cấp</caption>
                <thead>
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-medium">
                      Đơn vị
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Đã hứa
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Đã giao
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Tỷ lệ giao
                    </th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">
                      Tỷ lệ nhận
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {performance.quantityMetrics.map((metric) => (
                    <tr key={metric.unit}>
                      <th scope="row" className="px-3 py-2 text-left font-medium">
                        {metric.unit}
                      </th>
                      <td className="px-3 py-2 text-right">
                        {metric.promisedQuantity === null
                          ? "Chưa có số"
                          : formatQuantity(metric.promisedQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {metric.actualQuantity === null
                          ? "Chưa có số"
                          : formatQuantity(metric.actualQuantity)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatBasisPoints(metric.fulfilmentRateBasisPoints)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatBasisPoints(metric.acceptanceRateBasisPoints)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      <p className="text-caption text-ink-muted">
        Policy v{performance.policyVersion ?? "chưa có"} · nguồn{" "}
        {performance.sourceObservationIds.length}
      </p>
    </section>
  );
}

function PerformanceValue({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-input border border-border bg-surface-muted/50 p-3">
      <span className="block text-caption text-ink-muted">{label}</span>
      <strong className="tabular mt-1 block text-subheading text-ink">{value}</strong>
    </div>
  );
}

function formatBasisPoints(value: number | null): string {
  if (value === null) return "Chưa có số";
  const whole = Math.floor(value / 100);
  const fractional = String(value % 100).padStart(2, "0");
  return `${whole}.${fractional}%`;
}

function sourceHref(entry: SupplierAccountEntryDto): string | null {
  if (entry.sourceDocument?.type === "purchase") return `/purchases/${entry.sourceDocument.id}`;
  if (entry.sourceDocument?.type === "supplier_payment") {
    return `/supplier-payments/${entry.sourceDocument.id}`;
  }
  if (entry.sourceDocument?.type === "supplier_adjustment") {
    return `/supplier-account-adjustments/${entry.sourceDocument.id}`;
  }
  return null;
}
