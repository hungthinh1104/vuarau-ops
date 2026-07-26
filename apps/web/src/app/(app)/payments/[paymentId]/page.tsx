"use client";

import { useQuery } from "@tanstack/react-query";
import type { PaymentId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { PaymentStatus } from "../../../../ui/patterns/payment-status.tsx";
import { BalanceCard } from "../../../../ui/patterns/balance-card.tsx";
import { formatInstant, formatRecordedGap } from "../../../../ui/format.ts";

const METHOD_COPY = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  other: "Khác",
} as const;

/**
 * What was recorded, read back from the server.
 *
 * The screen the worker lands on after confirming, and it deliberately shows the
 * **server's** numbers rather than the ones typed a moment ago. That is the whole
 * point of navigating here: the preview said what would happen, and this says what
 * did. If a duplicate tap had produced two payments, this is where it would be
 * visible — one payment, one amount.
 *
 * The customer's balance is re-read alongside it, because "did that land" is
 * really a question about the account, not about the receipt.
 */
export default function PaymentDetailPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const params = useParams<{ paymentId: string }>();
  const paymentId = params.paymentId as PaymentId;

  const payment = useQuery(trpc.payment.get.queryOptions({ workspaceId, paymentId }));

  return (
    <div className="flex flex-col gap-5">
      <QueryStates
        query={payment}
        loadingLabel="Đang tải phiếu thu"
        attemptedAction="Xem phiếu thu"
        onRetry={() => void payment.refetch()}
      >
        {(recorded) => (
          <>
            <div>
              <h1 className="text-heading font-bold">Đã ghi nhận thanh toán</h1>
              <p className="mt-1 text-body text-ink-muted">{recorded.customerDisplayName}</p>
            </div>

            <section className="rounded-card border border-border bg-surface p-4">
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

                <dt className="text-ink-muted">Thời điểm</dt>
                <dd className="text-right text-ink">{formatInstant(recorded.transactionTime)}</dd>
              </dl>

              {/* Only when they differ: a back-dated or offline-captured payment.
                  When they agree, showing both is noise. */}
              {formatRecordedGap(recorded.transactionTime, recorded.recordedAt) !== null ? (
                <p className="mt-1 text-caption text-ink-muted">
                  {formatRecordedGap(recorded.transactionTime, recorded.recordedAt)}
                </p>
              ) : null}
            </section>

            <CustomerBalanceAfter
              workspaceId={workspaceId}
              customerId={recorded.customerId}
              customerName={recorded.customerDisplayName}
            />

            <Link
              href={`/customers/${recorded.customerId}`}
              className="touch-target inline-flex items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Xem sổ công nợ khách hàng
            </Link>
          </>
        )}
      </QueryStates>
    </div>
  );
}

function CustomerBalanceAfter({
  workspaceId,
  customerId,
  customerName,
}: {
  workspaceId: string;
  customerId: string;
  customerName: string;
}) {
  const trpc = useTRPC();
  const balance = useQuery(
    trpc.account.balance.queryOptions({
      workspaceId: workspaceId as never,
      customerId: customerId as never,
    }),
  );

  return (
    <QueryStates query={balance} loadingLabel="Đang tải công nợ" attemptedAction="Xem công nợ">
      {(current) => (
        <BalanceCard
          customerName={customerName}
          balance={current.balance}
          classification={current.classification}
          lastEntryTransactionTime={current.lastEntryTransactionTime}
        />
      )}
    </QueryStates>
  );
}
