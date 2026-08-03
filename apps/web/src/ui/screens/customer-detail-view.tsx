"use client";

import type {
  AccountTimelineEntryDto,
  CustomerDetailDto,
  PaymentSummaryDto,
  SaleSummaryDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatMoney } from "@/ui/format.ts";
import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { TimelineItem } from "@/ui/patterns/timeline-item.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";

export function CustomerDetailView(props: {
  readonly detail: CustomerDetailDto;
  readonly timelineEntries: readonly AccountTimelineEntryDto[];
  readonly timelineState: "loading" | "ready" | "error";
  readonly timelineHasMore: boolean;
  readonly timelineFetching: boolean;
  readonly recentSales: readonly SaleSummaryDto[];
  readonly recentPayments: readonly PaymentSummaryDto[];
  readonly canCreateSale: boolean;
  readonly canRecordPayment: boolean;
  readonly canAdjustDebt: boolean;
  readonly customerCommandLocked: boolean;
  readonly documentSection?: ReactNode;
  readonly outcomes?: ReactNode;
  readonly onDeactivate: () => void;
  readonly onReactivate: () => void;
  readonly onLoadMore: () => void;
  readonly onRetryTimeline: () => void;
}) {
  const { detail } = props;
  const customerId = detail.customer.id;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6">
        <PageHeader
          title={detail.customer.displayName}
          back={{ href: "/customers", label: "Khách hàng" }}
          status={detail.customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
        />

        {detail.customer.phone !== null ? (
          <a
            href={`tel:${detail.customer.phone}`}
            className="text-body text-info underline underline-offset-2"
          >
            {detail.customer.phone}
          </a>
        ) : null}

        <BalanceCard
          customerName={detail.customer.displayName}
          balance={detail.balance}
          classification={detail.classification}
        />

        {detail.customer.note !== null ? (
          <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
            {detail.customer.note}
          </p>
        ) : null}

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {props.canCreateSale && detail.customer.isActive ? (
            <LinkButton href={`/customers/${customerId}/sales/new`} className="flex-1">
              Tạo đơn mới
            </LinkButton>
          ) : null}
          {props.canRecordPayment ? (
            <LinkButton
              tone="secondary"
              href={`/customers/${customerId}/payments/new`}
              className="flex-1"
            >
              Ghi nhận thanh toán
            </LinkButton>
          ) : null}
          {detail.capabilities.update.allowed ? (
            <LinkButton tone="secondary" href={`/customers/${customerId}/edit`} className="flex-1">
              Sửa hồ sơ
            </LinkButton>
          ) : null}
          {props.canAdjustDebt ? (
            <LinkButton
              tone="secondary"
              href={`/customers/${customerId}/account/adjust`}
              className="flex-1"
            >
              Điều chỉnh công nợ
            </LinkButton>
          ) : null}
          <LinkButton
            tone="secondary"
            href={`/customers/${customerId}/account/reconciliation`}
            className="flex-1"
          >
            Giải thích số dư
          </LinkButton>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          {detail.capabilities.deactivate.allowed ? (
            <Button
              tone="danger"
              disabled={props.customerCommandLocked}
              onClick={props.onDeactivate}
            >
              Ngưng khách hàng
            </Button>
          ) : null}
          {detail.capabilities.reactivate.allowed ? (
            <Button
              tone="secondary"
              disabled={props.customerCommandLocked}
              onClick={props.onReactivate}
            >
              Kích hoạt lại
            </Button>
          ) : null}
        </div>
        {props.outcomes}
        {props.documentSection}
      </div>

      <CustomerTimelineSection
        entries={props.timelineEntries}
        state={props.timelineState}
        hasMore={props.timelineHasMore}
        fetching={props.timelineFetching}
        onLoadMore={props.onLoadMore}
        onRetry={props.onRetryTimeline}
      />

      <RecentCustomerActivity sales={props.recentSales} payments={props.recentPayments} />
    </div>
  );
}

function CustomerTimelineSection(props: {
  readonly entries: readonly AccountTimelineEntryDto[];
  readonly state: "loading" | "ready" | "error";
  readonly hasMore: boolean;
  readonly fetching: boolean;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-subheading font-semibold">Sổ công nợ</h2>
      {props.state === "loading" ? (
        <p className="text-body-sm text-ink-muted">Đang tải sổ công nợ…</p>
      ) : props.state === "error" && props.entries.length === 0 ? (
        <div role="alert" className="rounded-card border border-danger/30 p-4 text-body-sm">
          <p>Không tải được sổ công nợ. Không suy ra số dư từ dữ liệu thiếu.</p>
          <Button className="mt-3" tone="secondary" onClick={props.onRetry}>
            Thử lại
          </Button>
        </div>
      ) : props.entries.length === 0 ? (
        <EmptyState
          title="Chưa có giao dịch nào"
          description="Công nợ đúng bằng 0 ₫ vì chưa có đơn hàng hay thanh toán nào được ghi."
        />
      ) : (
        <>
          <ul
            aria-label="Giao dịch công nợ"
            className="rounded-card border border-border bg-surface px-4"
          >
            {props.entries.map((entry) => {
              const href = sourceHref(entry);
              return (
                <TimelineItem
                  key={entry.id}
                  entry={entry}
                  {...(href === undefined ? {} : { sourceHref: href })}
                />
              );
            })}
          </ul>
          {props.state === "error" ? (
            <p role="alert" className="text-body-sm text-danger">
              Không tải được trang tiếp theo. Các dòng đang hiện vẫn là dữ liệu máy chủ đã xác nhận.
            </p>
          ) : null}
          {props.hasMore ? (
            <div className="flex items-center gap-3">
              <p className="text-caption text-ink-muted">
                Đang hiện {props.entries.length} dòng gần nhất.
              </p>
              <Button tone="secondary" disabled={props.fetching} onClick={props.onLoadMore}>
                {props.fetching ? "Đang tải" : "Tải thêm"}
              </Button>
              {props.state === "error" ? (
                <Button tone="link" className="min-h-0 sm:min-h-0" onClick={props.onRetry}>
                  Thử lại
                </Button>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RecentCustomerActivity(props: {
  readonly sales: readonly SaleSummaryDto[];
  readonly payments: readonly PaymentSummaryDto[];
}) {
  return (
    <section className="grid gap-6 md:grid-cols-2">
      <div className="border-t border-border pt-4">
        <h2 className="text-subheading font-semibold">Đơn gần đây</h2>
        {props.sales.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 text-body-sm">
            {props.sales.map((sale) => (
              <li key={sale.id}>
                <Link
                  href={`/sales/${sale.id}`}
                  className="font-semibold text-info underline-offset-4 hover:underline"
                >
                  {formatDate(sale.transactionTime)} · {formatMoney(sale.totalAmount)}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-ink-muted">Chưa có đơn.</p>
        )}
      </div>
      <div className="border-t border-border pt-4">
        <h2 className="text-subheading font-semibold">Thanh toán gần đây</h2>
        {props.payments.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2 text-body-sm">
            {props.payments.map((payment) => (
              <li key={payment.id}>
                <Link
                  href={`/payments/${payment.id}`}
                  className="font-semibold text-info underline-offset-4 hover:underline"
                >
                  {formatDate(payment.transactionTime)} · {formatMoney(payment.amount)}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-body-sm text-ink-muted">Chưa có thanh toán.</p>
        )}
      </div>
    </section>
  );
}

function sourceHref(entry: AccountTimelineEntryDto): string | undefined {
  if (entry.source.document.type === "sale") return `/sales/${entry.source.document.id}`;
  if (entry.source.document.type === "payment") return `/payments/${entry.source.document.id}`;
  if (entry.source.document.type === "adjustment") {
    return `/account-adjustments/${entry.source.document.id}`;
  }
  return undefined;
}
