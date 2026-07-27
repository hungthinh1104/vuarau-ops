"use client";

import { useQuery } from "@tanstack/react-query";
import type { SaleId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { SaleStatus } from "../../../../ui/patterns/sale-status.tsx";
import { BalanceCard } from "../../../../ui/patterns/balance-card.tsx";
import { TimelineItem } from "../../../../ui/patterns/timeline-item.tsx";
import {
  formatInstant,
  formatMoney,
  formatQuantity,
  formatRecordedGap,
} from "../../../../ui/format.ts";

/**
 * A posted sale, read back from the server, beside the account entry it created.
 *
 * The screen a worker lands on after chốt đơn, and the answer to the question the
 * pilot asks them: *"đơn này đã ghi vào sổ chưa?"* So it shows the sale **and**
 * the ledger line the sale produced, on one screen — a receipt that says "posted"
 * without showing the money moving is a receipt somebody has to take on trust.
 *
 * Nothing here is editable, and there is no control that suggests otherwise. A
 * posted sale is immutable (BR-SALE-008); a correction is a void plus a
 * replacement, which is a different screen and a different permission.
 */
export default function SaleDetailPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const params = useParams<{ saleId: string }>();
  const saleId = params.saleId as SaleId;

  const sale = useQuery(trpc.sale.receipt.queryOptions({ workspaceId, saleId }));

  return (
    <div className="flex flex-col gap-5">
      <QueryStates
        query={sale}
        loadingLabel="Đang tải đơn hàng"
        attemptedAction="Xem đơn hàng"
        onRetry={() => void sale.refetch()}
      >
        {(receipt) => (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-heading font-bold">
                {receipt.sale.status === "posted" ? "Bông hàng" : "Đơn hàng"}
              </h1>
              <SaleStatus
                status={receipt.sale.status}
                financialState={receipt.sale.financialState}
                dueState={receipt.sale.dueState}
                replacesSaleId={receipt.sale.replacesSaleId}
              />
            </div>

            <section className="rounded-card border border-border bg-surface p-4">
              <ul className="flex flex-col gap-2">
                {receipt.sale.lines.map((line) => (
                  <li key={line.lineId} className="flex items-baseline justify-between gap-3">
                    <span className="text-body text-ink">
                      {line.productName}
                      <span className="ml-2 text-caption text-ink-muted">
                        {/* Exactly as entered. kg, bó and thùng are never
                            converted into one another (ASM-011). */}
                        {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
                      </span>
                    </span>
                    <span className="tabular text-body font-medium text-ink">
                      {formatMoney(line.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-subheading font-semibold">Tổng đơn</span>
                <span className="tabular text-heading font-bold" data-testid="posted-total">
                  {formatMoney(receipt.sale.totalAmount)}
                </span>
              </div>
            </section>

            {receipt.sale.note !== null ? (
              <p className="rounded-card bg-surface-muted px-4 py-3 text-body-sm text-ink">
                {receipt.sale.note}
              </p>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-ink-muted">Thời điểm bán</dt>
              <dd className="text-right text-ink">{formatInstant(receipt.sale.transactionTime)}</dd>
              {formatRecordedGap(receipt.sale.transactionTime, receipt.sale.recordedAt) !== null ? (
                <>
                  <dt className="text-ink-muted">Ghi vào sổ</dt>
                  <dd className="text-right text-ink">{formatInstant(receipt.sale.recordedAt)}</dd>
                </>
              ) : null}
            </dl>

            {receipt.accountEffect !== null ? (
              <section className="rounded-card border border-border bg-surface p-4">
                <h2 className="text-subheading font-semibold">Ảnh hưởng công nợ</h2>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-body-sm">
                  <dt>Công nợ trước</dt>
                  <dd className="tabular">{formatMoney(receipt.accountEffect.balanceBefore)}</dd>
                  <dt>Bông này</dt>
                  <dd className="tabular">{formatMoney(receipt.accountEffect.change)}</dd>
                  <dt className="font-semibold">Công nợ mới</dt>
                  <dd className="tabular font-semibold">
                    {formatMoney(receipt.accountEffect.balanceAfter)}
                  </dd>
                </dl>
              </section>
            ) : null}

            <Link
              href={`/customers/${receipt.sale.customerId}`}
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

/**
 * The ledger line this sale produced, and the balance after it.
 *
 * Filtered to entries whose source **is** this sale, so the screen shows the one
 * financial event rather than the customer's whole history. If posting had
 * created two entries — the failure BR-SALE-007 exists to prevent — two would
 * appear here.
 */
function AccountEffect({
  workspaceId,
  customerId,
  saleId,
}: {
  workspaceId: string;
  customerId: string;
  saleId: string;
}) {
  const trpc = useTRPC();
  const balance = useQuery(
    trpc.account.balance.queryOptions({
      workspaceId: workspaceId as never,
      customerId: customerId as never,
    }),
  );
  const timeline = useQuery(
    trpc.account.timeline.queryOptions({
      workspaceId: workspaceId as never,
      customerId: customerId as never,
      from: null,
      to: null,
      cursor: null,
      limit: 20,
    }),
  );

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-subheading font-semibold">Ảnh hưởng công nợ</h2>

      <QueryStates query={balance} loadingLabel="Đang tải công nợ" attemptedAction="Xem công nợ">
        {(current) => (
          <BalanceCard
            customerName="Sau đơn này"
            balance={current.balance}
            classification={current.classification}
            lastEntryTransactionTime={current.lastEntryTransactionTime}
          />
        )}
      </QueryStates>

      <QueryStates
        query={timeline}
        loadingLabel="Đang tải sổ công nợ"
        attemptedAction="Xem sổ công nợ"
      >
        {(page) => {
          const fromThisSale = page.items.filter((entry) => entry.source.id === saleId);
          if (fromThisSale.length === 0) return null;
          return (
            <ul
              data-testid="sale-account-entries"
              className="rounded-card border border-border bg-surface px-4"
            >
              {fromThisSale.map((entry) => (
                <TimelineItem key={entry.id} entry={entry} />
              ))}
            </ul>
          );
        }}
      </QueryStates>
    </section>
  );
}
