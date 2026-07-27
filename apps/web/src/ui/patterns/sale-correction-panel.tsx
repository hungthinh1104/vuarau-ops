"use client";

import type { SaleVoidReasonCode } from "@vuarau/domain-contracts";
import { useState } from "react";
import { Button } from "../primitives/button.tsx";
import { Select } from "../primitives/select.tsx";
import { Textarea } from "../primitives/textarea.tsx";

export type SaleCorrectionSubmission = {
  readonly reasonCode: SaleVoidReasonCode;
  readonly reason: string;
  readonly replacement: boolean;
};

export type SaleCorrectionPanelProps = {
  readonly onSubmit: (submission: SaleCorrectionSubmission) => void;
  readonly disabled?: boolean;
};

const REASON_OPTIONS = [
  { value: "wrong_amount", label: "Sai số tiền hoặc giá" },
  { value: "wrong_customer", label: "Sai khách hàng" },
  { value: "goods_returned", label: "Hàng bị trả lại" },
  { value: "duplicate_entry", label: "Ghi trùng đơn" },
  { value: "cancelled_by_customer", label: "Khách hủy đơn" },
  { value: "other", label: "Khác" },
] as const;

/**
 * Captures the operator's correction intent, but deliberately does not decide
 * how money moves. The parent sends the existing VoidSale command; a requested
 * replacement is an ordinary, prefilled new-sale draft after that void succeeds.
 */
export function SaleCorrectionPanel({ onSubmit, disabled = false }: SaleCorrectionPanelProps) {
  const [reasonCode, setReasonCode] = useState<SaleVoidReasonCode>("wrong_amount");
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();

  function submit(): void {
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError("Hãy ghi lý do điều chỉnh.");
      return;
    }
    setReasonError(undefined);
    onSubmit({ reasonCode, reason: trimmed, replacement });
  }

  return (
    <section className="rounded-card border border-danger/40 bg-surface p-4">
      <h2 className="text-subheading font-semibold">Điều chỉnh đơn đã chốt</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Đơn đã chốt không sửa trực tiếp. Hệ thống sẽ void đơn hiện tại; bạn có thể tạo một đơn thay
        thế sau đó.
      </p>
      <div className="mt-4 flex flex-col gap-4">
        <Select
          label="Loại điều chỉnh"
          value={reasonCode}
          onChange={(event) => setReasonCode(event.target.value as SaleVoidReasonCode)}
          options={REASON_OPTIONS}
          disabled={disabled}
        />
        <Textarea
          label="Lý do điều chỉnh"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          {...(reasonError !== undefined ? { error: reasonError } : {})}
          hint="Lý do này được lưu cùng phiếu void để có thể đối chiếu sau này."
          required
          disabled={disabled}
        />
        <label className="flex items-start gap-2 text-body-sm text-ink">
          <input
            type="checkbox"
            checked={replacement}
            onChange={(event) => setReplacement(event.target.checked)}
            disabled={disabled}
            className="mt-1 size-4 accent-leaf"
          />
          <span>
            <strong>Tạo đơn thay thế sau khi void</strong>
            <span className="block text-ink-muted">
              Dữ liệu đơn cũ sẽ được điền sẵn; bạn kiểm tra và chốt như một đơn mới.
            </span>
          </span>
        </label>
        <Button tone="danger-solid" onClick={submit} disabled={disabled}>
          {replacement ? "Void và tạo đơn thay thế" : "Xác nhận void"}
        </Button>
      </div>
    </section>
  );
}
