"use client";

import { useState } from "react";
import { parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { EvidenceReferenceInput } from "@/ui/patterns/evidence/evidence-reference-input.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type CustomerCreditPreservationPanelProps = {
  readonly onSubmit: (input: {
    readonly amountMinor: number;
    readonly reason: string;
    readonly evidenceReferences: readonly string[];
  }) => void;
  readonly disabled?: boolean;
};

/**
 * Captures the operator's financial intent only. The server derives the live
 * unallocated amount under the Payment lock; the browser must not guess it.
 */
export function CustomerCreditPreservationPanel({
  onSubmit,
  disabled = false,
}: CustomerCreditPreservationPanelProps) {
  const [amountText, setAmountText] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<string | undefined>();

  function submit(): void {
    const amount = parseMoneyText(amountText, "VND");
    if (!amount.ok || amount.value === null || amount.value.amountMinor <= 0) {
      setError("Nhập số tiền lớn hơn 0.");
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length === 0) {
      setError("Hãy ghi lý do giữ lại khoản tiền này.");
      return;
    }
    setError(undefined);
    onSubmit({
      amountMinor: amount.value.amountMinor,
      reason: trimmedReason,
      evidenceReferences: evidence
        .split(/[\n,]/)
        .map((reference) => reference.trim())
        .filter((reference) => reference.length > 0),
    });
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Giữ lại làm tín dụng khách hàng</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Đây là một quyết định tài chính cho phần Payment chưa được phân bổ. Hệ thống sẽ kiểm tra số
        dư thực tế trước khi ghi nhận; không tạo thêm bút toán công nợ.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <MoneyInput
          label="Số tiền giữ lại"
          currency="VND"
          value={amountText}
          onChange={(event) => setAmountText(event.target.value)}
          required
          disabled={disabled}
        />
        <Textarea
          label="Lý do"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          required
          disabled={disabled}
          {...(error !== undefined ? { error } : {})}
        />
        <EvidenceReferenceInput
          value={evidence}
          onChange={setEvidence}
          disabled={disabled}
          hint="Biên nhận, ghi chú đối chiếu hoặc tham chiếu giải thích quyết định này."
        />
        <Button tone="primary" onClick={submit} disabled={disabled}>
          Xác nhận giữ tín dụng
        </Button>
      </div>
    </section>
  );
}
