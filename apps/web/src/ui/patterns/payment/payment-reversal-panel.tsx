"use client";

import { useState } from "react";
import { parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type PaymentReversalPanelProps = {
  readonly remainingAmountMinor: number;
  readonly onSubmit: (input: { readonly amountMinor: number; readonly reason: string }) => void;
  readonly disabled?: boolean;
};

/** Captures reversal intent only; the server owns remaining amount and compensation. */
export function PaymentReversalPanel({
  remainingAmountMinor,
  onSubmit,
  disabled = false,
}: PaymentReversalPanelProps) {
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | undefined>();

  function submit(): void {
    const amount = parseMoneyText(amountText, "VND");
    if (
      !amount.ok ||
      amount.value === null ||
      amount.value.amountMinor <= 0 ||
      amount.value.amountMinor > remainingAmountMinor
    ) {
      setError("Nhập số tiền lớn hơn 0 và không vượt phần còn hoàn được.");
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("Hãy ghi lý do hoàn tác.");
      return;
    }
    setError(undefined);
    onSubmit({ amountMinor: amount.value.amountMinor, reason: trimmed });
  }

  return (
    <section className="rounded-card border border-danger/40 bg-surface p-4">
      <h2 className="text-subheading font-semibold">Hoàn tác thanh toán</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Hệ thống sẽ ghi một bút toán bù trừ; phiếu thu gốc không bị xoá.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <MoneyInput
          label="Số tiền hoàn"
          currency="VND"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          required
          disabled={disabled}
        />
        <Textarea
          label="Lý do hoàn tác"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          disabled={disabled}
          {...(error !== undefined ? { error } : {})}
        />
        <Button tone="danger-solid" onClick={submit} disabled={disabled}>
          Xác nhận hoàn tác
        </Button>
      </div>
    </section>
  );
}
