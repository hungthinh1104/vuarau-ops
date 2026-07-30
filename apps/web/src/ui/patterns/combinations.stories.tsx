import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { SaleStatus } from "@/ui/patterns/sale/sale-status.tsx";
import { PaymentStatus } from "@/ui/patterns/payment/payment-status.tsx";
import { CapabilityAction } from "./capability-action.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { UnknownNetworkOutcome } from "@/ui/patterns/feedback/unknown-network-outcome.tsx";
import { CommandProgressNotice } from "@/ui/patterns/feedback/command-progress-notice.tsx";
import { TimelineItem } from "./timeline-item.tsx";
import { formatMoney } from "../format.ts";
import type { CommandIdentity, PendingCommand } from "@/api/command-identity.ts";
import { markSucceeded, retryUnknown } from "@/api/command-identity.ts";
import { balanceCustomerCredit } from "@/fixtures/account.fixtures.ts";
import { paymentPartiallyReversed } from "@/fixtures/payment.fixtures.ts";
import { rejectionPermissionDenied } from "@/fixtures/rejection.fixtures.ts";
import { saleReplacement, saleVoided, salePosted } from "@/fixtures/sale.fixtures.ts";
import { accountTimeline } from "@/fixtures/account.fixtures.ts";
import { salesSession } from "@/fixtures/session.fixtures.ts";
import { ACTOR_ID, COMMAND_ID, IDEMPOTENCY_KEY, WORKSPACE_ID } from "@vuarau/test-fixtures/ids";
import { TRANSACTION_TIME } from "@vuarau/test-fixtures/time";

/**
 * States that only make sense together.
 *
 * A component in isolation can be right and the screen still wrong. These are the
 * combinations where the interesting behaviour lives in the *relationship* —
 * between a void and its replacement, between an overpayment and the wording of
 * the balance, between a timeout and the retry that follows it.
 */
const meta = { title: "Patterns/Combinations" } satisfies Meta;
export default meta;
type Story = StoryObj;

const identity: CommandIdentity = {
  commandId: COMMAND_ID,
  idempotencyKey: IDEMPOTENCY_KEY,
  workspaceId: WORKSPACE_ID,
  actorId: ACTOR_ID,
  occurredAt: TRANSACTION_TIME,
};

/** The common depot sale: chốt xong, không hẹn ngày trả. No warning chip anywhere. */
export const PostedWithNoDueDate: Story = {
  name: "Đơn đã chốt, không có hạn trả",
  render: () => (
    <div className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4">
      <span className="tabular text-heading font-bold">{formatMoney(salePosted.totalAmount)}</span>
      <SaleStatus
        status={salePosted.status}
        financialState={salePosted.financialState}
        dueState={salePosted.dueState}
      />
      <p className="text-caption text-ink-muted">
        Không có ô cảnh báo nào — phần lớn đơn của vựa không hẹn ngày.
      </p>
    </div>
  ),
};

/**
 * The void is never hidden, and the reason travels with it. That text is what
 * somebody disputing the balance six months later actually reads (BR-SALE-014).
 */
export const VoidedWithReasonAndActor: Story = {
  name: "Đơn hoàn tác — kèm lý do và người thực hiện",
  render: () => (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="tabular text-heading font-bold line-through decoration-danger">
          {formatMoney(saleVoided.totalAmount)}
        </span>
        <SaleStatus
          status={saleVoided.status}
          financialState={saleVoided.financialState}
          dueState={saleVoided.dueState}
          replacedBySaleId={saleReplacement.id}
        />
      </div>
      <p className="text-body-sm text-ink">{saleVoided.voidRecord?.reason}</p>
      <p className="text-caption text-ink-muted">Chị Hạnh (bán hàng) · 20/07/2026</p>
    </div>
  ),
};

/** Both directions of the chain, so a reader can follow it from either end. */
export const ReplacementLinkedToOriginal: Story = {
  name: "Đơn thay thế — liên kết hai chiều",
  render: () => (
    <div className="flex flex-col gap-3">
      <div className="rounded-card border border-border bg-surface p-4">
        <p className="text-caption text-ink-muted">Đơn gốc</p>
        <span className="tabular text-subheading font-semibold line-through">
          {formatMoney(saleVoided.totalAmount)}
        </span>
        <div className="mt-2">
          <SaleStatus
            status={saleVoided.status}
            financialState="voided"
            dueState="no_due_date"
            replacedBySaleId={saleReplacement.id}
          />
        </div>
      </div>
      <div className="rounded-card border border-leaf/30 bg-leaf-soft p-4">
        <p className="text-caption text-ink-muted">Đơn thay thế</p>
        <span className="tabular text-subheading font-semibold">
          {formatMoney(saleReplacement.totalAmount)}
        </span>
        <div className="mt-2">
          <SaleStatus
            status={saleReplacement.status}
            financialState="active"
            dueState="no_due_date"
            replacesSaleId={saleVoided.id}
          />
        </div>
      </div>
    </div>
  ),
};

/**
 * Overpayment, and the timeline that produced it. The balance says "Vựa nợ khách"
 * while the last ledger line is a `−875.000` compensation — the pair is visible,
 * so the arithmetic can be followed.
 */
export const CustomerCreditAfterOverpayment: Story = {
  name: "Khách trả dư — vựa nợ khách",
  render: () => (
    <div className="flex flex-col gap-4">
      <BalanceCard
        customerName="Cô Hoà — quán cơm Tân Bình"
        balance={balanceCustomerCredit.balance}
        classification={balanceCustomerCredit.classification}
      />
      <ul className="rounded-card border border-border bg-surface px-4">
        {accountTimeline.map((entry) => (
          <TimelineItem key={entry.id} entry={entry} actorName="Chị Hạnh (bán hàng)" />
        ))}
      </ul>
    </div>
  ),
};

export const PartiallyReversedWithAllThree: Story = {
  name: "Hoàn một phần — gốc, đã hoàn, còn hoàn được",
  render: () => (
    <div className="rounded-card border border-border bg-surface p-4">
      <PaymentStatus
        status={paymentPartiallyReversed.status}
        amount={paymentPartiallyReversed.amount}
        reversedAmount={paymentPartiallyReversed.reversedAmount}
        remainingReversibleAmount={paymentPartiallyReversed.remainingReversibleAmount}
      />
    </div>
  ),
};

/**
 * Access narrowed between the read and the tap.
 *
 * The button was rendered from a capability that was true when the query answered.
 * The refusal that follows is not a bug; hiding it would be.
 */
export const PermissionRevokedBetweenLoadAndAction: Story = {
  name: "Mất quyền giữa lúc xem và lúc bấm",
  render: () => (
    <div className="flex flex-col gap-3">
      <CapabilityAction
        label="Hoàn tác đơn"
        tone="danger"
        // Allowed by state — the sale really is voidable — but the role is not.
        capability={{ allowed: true }}
        permission="sale.void"
        session={salesSession}
        onAction={() => undefined}
      />
      <PermissionDenied error={rejectionPermissionDenied} attemptedAction="Hoàn tác đơn hàng" />
    </div>
  ),
};

/**
 * The sequence that must not create a second sale.
 *
 * Press "Gửi lại" and the identity does not change — the same `idempotencyKey`
 * goes back, and the server answers with what the first attempt produced. The
 * success message says so, because silence leaves somebody wondering whether their
 * second tap made a second payment.
 */
export const UnknownThenDuplicateSafeSuccess: Story = {
  name: "Mất mạng rồi gửi lại — không tạo phiếu thứ hai",
  render: function Render() {
    const [pending, setPending] = useState<PendingCommand<null>>({
      identity,
      payload: null,
      phase: { kind: "unknown" },
      attempts: 1,
    });

    if (pending.phase.kind === "unknown") {
      return (
        <UnknownNetworkOutcome
          identity={pending.identity}
          attempts={pending.attempts}
          attemptedAction="Ghi nhận thanh toán 500.000 ₫"
          // `retryUnknown` carries the identity through untouched; there is no
          // parameter by which this handler could vary it.
          onResend={() => setPending((current) => markSucceeded(retryUnknown(current)))}
        />
      );
    }

    return (
      <div className="flex flex-col gap-2">
        <CommandProgressNotice
          phase={pending.phase}
          attemptedAction="Ghi nhận thanh toán 500.000 ₫"
          wasDuplicateSafeRetry
        />
        <p className="text-caption font-mono text-ink-muted">
          idempotencyKey: {pending.identity.idempotencyKey} · lần gửi {pending.attempts}
        </p>
      </div>
    );
  },
};
