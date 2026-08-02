"use client";

import type { SaleVoidReasonCode } from "@vuarau/domain-contracts";
import { useState } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { Checkbox } from "@/ui/primitives/checkbox.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type SaleCorrectionSubmission = {
  readonly reasonCode: SaleVoidReasonCode;
  readonly reason: string;
  readonly replacement: boolean;
  readonly replacementCustomerId: string | null;
};

export type CorrectionCustomerOption = { readonly id: string; readonly displayName: string };

export type SaleCorrectionPanelProps = {
  readonly onSubmit: (submission: SaleCorrectionSubmission) => void;
  /** Whether canonical fulfilment proves a full goods-return void is truthful. */
  readonly goodsReturnStatus?: "safe" | "blocked" | "unknown";
  readonly originalCustomerId?: string;
  readonly customerSearchQuery?: string;
  readonly customerMatches?: readonly CorrectionCustomerOption[];
  readonly onCustomerSearchChange?: (value: string) => void;
  readonly disabled?: boolean;
};

const REASON_OPTIONS = [
  { value: "wrong_amount", label: "Sai số tiền hoặc giá" },
  { value: "wrong_customer", label: "Sai khách hàng" },
  { value: "goods_returned", label: "Toàn bộ hàng đã trả / bị từ chối" },
  { value: "duplicate_entry", label: "Ghi trùng đơn" },
  { value: "cancelled_by_customer", label: "Khách hủy đơn" },
  { value: "other", label: "Khác" },
] as const;

/**
 * Captures the operator's correction intent, but deliberately does not decide
 * how money moves. The parent sends the existing VoidSale command; a requested
 * replacement is an ordinary, prefilled new-sale draft after that void succeeds.
 */
export function SaleCorrectionPanel({
  onSubmit,
  goodsReturnStatus = "unknown",
  originalCustomerId = "",
  customerSearchQuery = "",
  customerMatches = [],
  onCustomerSearchChange = () => undefined,
  disabled = false,
}: SaleCorrectionPanelProps) {
  const [reasonCode, setReasonCode] = useState<SaleVoidReasonCode>("wrong_amount");
  const [reason, setReason] = useState("");
  const [replacement, setReplacement] = useState(false);
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [replacementCustomerId, setReplacementCustomerId] = useState<string | null>(null);

  const goodsReturnUnavailable = reasonCode === "goods_returned" && goodsReturnStatus !== "safe";

  function submit(): void {
    if (goodsReturnUnavailable) return;
    const trimmed = reason.trim();
    if (trimmed.length === 0) {
      setReasonError("Hãy ghi lý do điều chỉnh.");
      return;
    }
    if (reasonCode === "wrong_customer" && replacement && replacementCustomerId === null) {
      setReasonError("Hãy chọn khách hàng đúng cho đơn thay thế.");
      return;
    }
    setReasonError(undefined);
    onSubmit({ reasonCode, reason: trimmed, replacement, replacementCustomerId });
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
        {reasonCode === "goods_returned" && goodsReturnStatus === "blocked" ? (
          <p
            role="alert"
            className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
          >
            Đơn vẫn còn hàng thực giao chưa trả hết. Không thể hoàn tác toàn bộ công nợ bằng lý do
            này: hãy ghi đúng lượng hàng thực trả; hậu quả tiền của trả một phần đang chờ ASM-037.
          </p>
        ) : null}
        {reasonCode === "goods_returned" && goodsReturnStatus === "unknown" ? (
          <p
            role="alert"
            className="rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
          >
            Chưa xác minh được toàn bộ hàng đã về kho. Tải lại trạng thái giao hàng trước khi hoàn
            tác toàn bộ công nợ.
          </p>
        ) : null}
        {reasonCode === "wrong_customer" && replacement ? (
          <div className="flex flex-col gap-2 rounded-card border border-border bg-surface-muted p-3">
            <label className="text-label font-semibold" htmlFor="replacement-customer-search">
              Khách hàng đúng
            </label>
            <Input
              id="replacement-customer-search"
              value={customerSearchQuery}
              onChange={(event) => onCustomerSearchChange(event.target.value)}
              placeholder="Tìm tên hoặc số điện thoại"
              disabled={disabled}
            />
            {customerMatches.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label="Kết quả tìm kiếm khách hàng">
                {customerMatches
                  .filter((customer) => customer.id !== originalCustomerId)
                  .map((customer) => (
                    <li key={customer.id}>
                      <Button
                        tone="secondary"
                        type="button"
                        onClick={() => setReplacementCustomerId(customer.id)}
                        disabled={disabled}
                        className="min-h-10 w-full justify-start px-2 py-2 text-left font-normal"
                        aria-pressed={replacementCustomerId === customer.id}
                      >
                        {customer.displayName}
                      </Button>
                    </li>
                  ))}
              </ul>
            ) : null}
            {replacementCustomerId !== null ? (
              <p className="text-caption text-ink-muted">Đã chọn khách hàng đúng.</p>
            ) : null}
          </div>
        ) : null}
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
          <Checkbox
            checked={replacement}
            onChange={(event) => setReplacement(event.target.checked)}
            disabled={disabled}
            className="mt-1"
          />
          <span>
            <strong>Tạo đơn thay thế sau khi void</strong>
            <span className="block text-ink-muted">
              Dữ liệu đơn cũ sẽ được điền sẵn; bạn kiểm tra và chốt như một đơn mới.
            </span>
          </span>
        </label>
        <Button tone="danger-solid" onClick={submit} disabled={disabled || goodsReturnUnavailable}>
          {replacement ? "Void và tạo đơn thay thế" : "Xác nhận void"}
        </Button>
      </div>
    </section>
  );
}
