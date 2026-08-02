"use client";

import type { SupplierPaymentDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatInstant, formatMoney } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

const STATUS_COPY: Readonly<Record<SupplierPaymentDto["status"], string>> = {
  recorded: "Đã ghi nhận",
  partially_reversed: "Hoàn tác một phần",
  reversed: "Đã hoàn tác hết",
};
const METHOD_COPY = { cash: "Tiền mặt", bank_transfer: "Chuyển khoản", other: "Khác" } as const;

export function SupplierPaymentDetailView({
  query,
  onRetry,
  canReverse,
  reversePanel,
}: {
  readonly query: QueryLike<SupplierPaymentDto>;
  readonly onRetry: () => void;
  readonly canReverse: boolean;
  readonly reversePanel?: ReactNode;
}) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải thanh toán" onRetry={onRetry}>
      {(detail) => (
        <div className="flex max-w-2xl flex-col gap-6">
          <PageHeader
            title="Thanh toán nhà cung cấp"
            back={{ href: `/suppliers/${detail.supplierId}`, label: "Mở nhà cung cấp" }}
            status={
              <Badge tone={detail.status === "recorded" ? "positive" : "warning"}>
                {STATUS_COPY[detail.status]}
              </Badge>
            }
          />
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Số tiền</dt>
            <dd className="tabular text-right font-bold">{formatMoney(detail.amount)}</dd>
            <dt>Đã hoàn tác</dt>
            <dd className="tabular text-right">{formatMoney(detail.reversedAmount)}</dd>
            <dt>Phương thức</dt>
            <dd className="text-right">{METHOD_COPY[detail.method]}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(detail.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(detail.recordedAt)}</dd>
          </dl>
          {detail.note === null ? null : <p>{detail.note}</p>}
          {canReverse && detail.status !== "reversed" ? reversePanel : null}
        </div>
      )}
    </QueryStates>
  );
}

export function SupplierPaymentReversalView({
  amount,
  reason,
  remaining,
  locked,
  feedback,
  onAmountChange,
  onReasonChange,
  onSubmit,
}: {
  readonly amount: string;
  readonly reason: string;
  readonly remaining: number;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onAmountChange: (value: string) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  const amountMinor = Math.round(Number(amount) * 1000);
  return (
    <section className="rounded-card border border-warning/40 p-4">
      <h2 className="font-semibold">Hoàn tác thanh toán</h2>
      <label className="text-label">
        Số tiền (nghìn đồng)
        <Input
          inputMode="numeric"
          value={amount}
          onChange={(event) => onAmountChange(event.target.value)}
        />
      </label>
      <label className="text-label">
        Giải thích
        <TextareaControl value={reason} onChange={(event) => onReasonChange(event.target.value)} />
      </label>
      <Button
        tone="danger"
        disabled={
          amountMinor <= 0 || amountMinor > remaining || reason.trim().length === 0 || locked
        }
        onClick={onSubmit}
      >
        {locked ? "Đang hoàn tác" : "Hoàn tác"}
      </Button>
      {feedback}
    </section>
  );
}
