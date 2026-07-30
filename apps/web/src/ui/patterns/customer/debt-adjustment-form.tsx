"use client";

import type { DebtAdjustmentDirection, DebtAdjustmentReasonCode } from "@vuarau/domain-contracts";
import { useState } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { parseMoneyText } from "@/ui/primitives/numeric-text.ts";

const DIRECTIONS = [
  { value: "increase", label: "Tăng công nợ" },
  { value: "decrease", label: "Giảm công nợ" },
] as const;
const REASONS = [
  { value: "opening_balance", label: "Số dư đầu kỳ" },
  { value: "write_off", label: "Xoá nợ" },
  { value: "dispute_settlement", label: "Chốt tranh chấp" },
  { value: "migration_correction", label: "Điều chỉnh chuyển sổ" },
  { value: "data_entry_correction", label: "Sửa dữ liệu cũ" },
  { value: "goodwill_discount", label: "Giảm trừ thiện chí" },
  { value: "other", label: "Khác" },
] as const;

export function DebtAdjustmentForm({
  onSubmit,
  disabled = false,
}: {
  readonly onSubmit: (input: {
    readonly direction: DebtAdjustmentDirection;
    readonly reasonCode: DebtAdjustmentReasonCode;
    readonly amountMinor: number;
    readonly reason: string;
  }) => void;
  readonly disabled?: boolean;
}) {
  const [direction, setDirection] = useState<DebtAdjustmentDirection>("increase");
  const [reasonCode, setReasonCode] = useState<DebtAdjustmentReasonCode>("opening_balance");
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();
  function submit(): void {
    const parsed = parseMoneyText(amountText, "VND");
    if (!parsed.ok || parsed.value === null || parsed.value.amountMinor <= 0) {
      setError("Số tiền phải lớn hơn 0.");
      return;
    }
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setError("Hãy ghi giải thích cho điều chỉnh này.");
      return;
    }
    setError(undefined);
    onSubmit({ direction, reasonCode, amountMinor: parsed.value.amountMinor, reason: trimmed });
  }
  return (
    <section className="flex flex-col gap-4">
      <p className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm">
        Không dùng điều chỉnh công nợ để sửa một đơn bán hoặc thanh toán sai.
      </p>
      <Select
        label="Hướng điều chỉnh"
        value={direction}
        onChange={(event) => setDirection(event.target.value as DebtAdjustmentDirection)}
        options={DIRECTIONS}
        disabled={disabled}
      />
      <Select
        label="Lý do"
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value as DebtAdjustmentReasonCode)}
        options={REASONS}
        disabled={disabled}
      />
      <MoneyInput
        label="Số tiền điều chỉnh"
        currency="VND"
        value={amountText}
        onChange={(event) => setAmountText(event.target.value)}
        required
        disabled={disabled}
      />
      <Textarea
        label="Giải thích"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        required
        disabled={disabled}
        {...(error !== undefined ? { error } : {})}
      />
      <Button onClick={submit} disabled={disabled}>
        Xác nhận điều chỉnh
      </Button>
    </section>
  );
}
