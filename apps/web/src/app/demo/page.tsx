"use client";

import { WorkspaceShell } from "../../ui/patterns/workspace-shell.tsx";
import { BalanceCard } from "../../ui/patterns/balance-card.tsx";
import { SaleStatus } from "../../ui/patterns/sale-status.tsx";
import { PaymentStatus } from "../../ui/patterns/payment-status.tsx";
import { TimelineItem } from "../../ui/patterns/timeline-item.tsx";
import { CapabilityAction } from "../../ui/patterns/capability-action.tsx";
import { Badge } from "../../ui/primitives/badge.tsx";
import { formatMoney } from "../../ui/format.ts";
import {
  accountTimeline,
  balanceReceivable,
  customerDetail,
  paymentPartiallyReversed,
  saleReplacement,
  salesSession,
  saleVoided,
  WORKSPACE_NAME,
} from "../../fixtures/index.ts";

/**
 * A composition proof, not a workflow.
 *
 * It exists to show that the shell, the balance, a sale's standing, a payment's
 * standing, a timeline and capability-controlled actions fit together and reflow
 * on a phone. Nothing here is wired to the API; every value is a fixture, and the
 * page says so at the top so that nobody mistakes it for a finished screen.
 *
 * The session is deliberately the **sales** role. That is what makes the
 * capability rule visible: `sale.post` is enabled, `sale.void` is not, and the
 * reason is shown rather than the control merely greyed. An owner session would
 * make every button green and prove nothing.
 *
 * A client component, because it passes handlers to buttons. The design-system
 * primitives that own interactivity carry their own `"use client"`, so a real
 * screen can be a server component that renders them — this one cannot, because
 * a function prop does not cross the server boundary.
 */
export default function DemoPage() {
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
            {/* Both halves of the answer: the sale's state, and this role's
                authority. A `sales` worker may post but never void. */}
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
          {/* The compensating pair stays visible: +875.000 and −875.000 are both
              here, so the running balance can be followed line by line. */}
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
