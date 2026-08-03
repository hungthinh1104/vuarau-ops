"use client";

import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { CapabilityAction } from "@/ui/patterns/capability-action.tsx";
import { PaymentStatus } from "@/ui/patterns/payment/payment-status.tsx";
import { SaleStatus } from "@/ui/patterns/sale/sale-status.tsx";
import { TimelineItem } from "@/ui/patterns/timeline-item.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { formatMoney } from "@/ui/format.ts";
import {
  accountTimeline,
  balanceReceivable,
  customerDetail,
  paymentPartiallyReversed,
  saleReplacement,
  salesSession,
  saleVoided,
  WORKSPACE_NAME,
} from "@/fixtures/index.ts";
import { WorkspaceShell } from "@/ui/patterns/layout/workspace-shell.tsx";

/** Fixture-only composition proof. It is never a source of business truth. */
export function DemoView() {
  return (
    <WorkspaceShell
      workspaceName={WORKSPACE_NAME}
      session={salesSession}
      userLabel="sales@example.com"
      notice="Bản dựng thử — mọi số liệu là dữ liệu mẫu, không kết nối máy chủ."
    >
      <div className="flex flex-col gap-6">
        <BalanceCard
          customerName={customerDetail.customer.displayName}
          balance={balanceReceivable.balance}
          classification={balanceReceivable.classification}
          lastEntryTransactionTime={balanceReceivable.lastEntryTransactionTime}
        />

        <section className="rounded-card border border-border bg-surface p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-subheading font-semibold">Đơn gần nhất</h2>
            <span className="tabular text-subheading font-semibold">
              {formatMoney(saleReplacement.totalAmount)}
            </span>
          </div>
          <div className="mt-3">
            <SaleStatus
              status={saleReplacement.status}
              financialState={saleReplacement.financialState}
              dueState={saleReplacement.dueState}
              replacesSaleId={saleReplacement.replacesSaleId}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <CapabilityAction
              label="Chốt đơn"
              capability={saleReplacement.capabilities.post}
              permission="sale.post"
              session={salesSession}
              onAction={() => undefined}
            />
            <CapabilityAction
              label="Hoàn tác đơn"
              tone="danger"
              capability={saleVoided.capabilities.void}
              permission="sale.void"
              session={salesSession}
              onAction={() => undefined}
            />
          </div>
        </section>

        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-subheading font-semibold">Phiếu thu gần nhất</h2>
          <div className="mt-3">
            <PaymentStatus
              status={paymentPartiallyReversed.status}
              amount={paymentPartiallyReversed.amount}
              reversedAmount={paymentPartiallyReversed.reversedAmount}
              remainingReversibleAmount={paymentPartiallyReversed.remainingReversibleAmount}
            />
          </div>
        </section>

        <section className="rounded-card border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-subheading font-semibold">Sổ công nợ</h2>
            <Badge tone="neutral">{accountTimeline.length} dòng</Badge>
          </div>
          <ul className="mt-2">
            {accountTimeline.map((entry) => (
              <TimelineItem key={entry.id} entry={entry} actorName="Chị Hạnh (bán hàng)" />
            ))}
          </ul>
        </section>
      </div>
    </WorkspaceShell>
  );
}
