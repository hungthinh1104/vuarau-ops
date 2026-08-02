"use client";

import type { PaymentSummaryDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { METHOD_COPY } from "@/ui/domain/payment-copy.ts";
import { formatInstant, formatRecordedGap } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PaymentStatus } from "@/ui/patterns/payment/payment-status.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function PaymentDetailView({
  query,
  onRetry,
  canReverse,
  balance,
  reversal,
}: {
  readonly query: QueryLike<PaymentSummaryDto>;
  readonly onRetry: () => void;
  readonly canReverse: boolean;
  readonly balance: ReactNode;
  readonly reversal?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={query}
        loadingLabel="Đang tải phiếu thu"
        attemptedAction="Xem phiếu thu"
        onRetry={onRetry}
      >
        {(recorded) => (
          <>
            <PageHeader
              title={`Thanh toán · ${recorded.customerDisplayName}`}
              description={formatInstant(recorded.transactionTime)}
              back={{
                href: `/customers/${recorded.customerId}`,
                label: "Xem sổ công nợ khách hàng",
              }}
            />
            <section className="border-y border-border py-4">
              <PaymentStatus
                status={recorded.status}
                amount={recorded.amount}
                reversedAmount={recorded.reversedAmount}
                remainingReversibleAmount={recorded.remainingReversibleAmount}
              />
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
                <dt className="text-ink-muted">Hình thức</dt>
                <dd className="text-right text-ink">{METHOD_COPY[recorded.method]}</dd>
                {recorded.payerName !== null ? (
                  <>
                    <dt className="text-ink-muted">Người trả</dt>
                    <dd className="text-right text-ink">{recorded.payerName}</dd>
                  </>
                ) : null}
                {recorded.note !== null ? (
                  <>
                    <dt className="text-ink-muted">Ghi chú</dt>
                    <dd className="text-right text-ink">{recorded.note}</dd>
                  </>
                ) : null}
                <dt className="text-ink-muted">Thời điểm</dt>
                <dd className="text-right text-ink">{formatInstant(recorded.transactionTime)}</dd>
              </dl>
              {formatRecordedGap(recorded.transactionTime, recorded.recordedAt) !== null ? (
                <p className="mt-1 text-caption text-ink-muted">
                  {formatRecordedGap(recorded.transactionTime, recorded.recordedAt)}
                </p>
              ) : null}
            </section>
            {balance}
            {canReverse ? reversal : null}
          </>
        )}
      </QueryStates>
    </div>
  );
}
