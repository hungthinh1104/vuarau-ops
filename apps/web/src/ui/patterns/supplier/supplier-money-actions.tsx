"use client";

import type { SupplierDto } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export type SupplierPaymentDirection = "increase_payable" | "decrease_payable";
export type SupplierAdjustmentReason =
  "opening_balance" | "write_off" | "settlement" | "manual_adjustment";

export type SupplierMoneyActionsProps = {
  readonly supplier: SupplierDto;
  readonly canRecordPayment: boolean;
  readonly canAdjust: boolean;
  readonly paymentAmount: string;
  readonly adjustmentAmount: string;
  readonly direction: SupplierPaymentDirection;
  readonly reasonCode: SupplierAdjustmentReason;
  readonly reason: string;
  readonly payment: CommandOutcomeView;
  readonly adjustment: CommandOutcomeView;
  readonly onPaymentAmount: (value: string) => void;
  readonly onAdjustmentAmount: (value: string) => void;
  readonly onDirection: (value: SupplierPaymentDirection) => void;
  readonly onReasonCode: (value: SupplierAdjustmentReason) => void;
  readonly onReason: (value: string) => void;
  readonly onRecordPayment: () => void;
  readonly onAdjust: () => void;
  readonly onChanged: () => void;
};

export function SupplierMoneyActions(props: SupplierMoneyActionsProps) {
  const paymentMinor = Math.round(Number(props.paymentAmount) * 1000);
  const adjustmentMinor = Math.round(Number(props.adjustmentAmount) * 1000);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {props.canRecordPayment ? (
        <section
          aria-labelledby="supplier-payment-title"
          className="rounded-card border border-border bg-surface p-4"
        >
          <h2 id="supplier-payment-title" className="text-subheading font-semibold">
            Ghi tiền trả nhà cung cấp
          </h2>
          <label className="text-label">
            Số tiền (nghìn đồng)
            <Input
              inputMode="numeric"
              value={props.paymentAmount}
              onChange={(event) => props.onPaymentAmount(event.target.value)}
            />
          </label>
          <Button
            disabled={
              !Number.isSafeInteger(paymentMinor) ||
              paymentMinor <= 0 ||
              props.payment.phase.kind === "sending"
            }
            onClick={props.onRecordPayment}
          >
            Ghi thanh toán
          </Button>
          <CommandOutcome
            command={props.payment}
            attemptedAction="Ghi thanh toán nhà cung cấp"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
      {props.canAdjust ? (
        <section
          aria-labelledby="supplier-adjustment-title"
          className="rounded-card border border-border bg-surface p-4"
        >
          <h2 id="supplier-adjustment-title" className="text-subheading font-semibold">
            Điều chỉnh công nợ
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Chỉ ghi fact tiền không có Purchase nguồn. Không dùng để bù cho hàng trả nhà cung cấp:
            thao tác này không chuyển tồn kho và ASM-038 chưa định nghĩa credit/claim tương ứng.
          </p>
          <Select
            label="Hướng điều chỉnh"
            value={props.direction}
            onChange={(event) => props.onDirection(event.target.value as SupplierPaymentDirection)}
            options={[
              { value: "increase_payable", label: "Tăng phải trả" },
              { value: "decrease_payable", label: "Giảm phải trả" },
            ]}
          />
          <Select
            label="Lý do"
            value={props.reasonCode}
            onChange={(event) => props.onReasonCode(event.target.value as SupplierAdjustmentReason)}
            options={[
              { value: "opening_balance", label: "Số dư đầu kỳ" },
              { value: "write_off", label: "Xoá số dư" },
              { value: "settlement", label: "Quyết toán" },
              { value: "manual_adjustment", label: "Điều chỉnh khác" },
            ]}
          />
          <label className="text-label">
            Số tiền (nghìn đồng)
            <Input
              inputMode="numeric"
              value={props.adjustmentAmount}
              onChange={(event) => props.onAdjustmentAmount(event.target.value)}
            />
          </label>
          <label className="text-label">
            Giải thích
            <TextareaControl
              value={props.reason}
              onChange={(event) => props.onReason(event.target.value)}
            />
          </label>
          <Button
            disabled={
              !Number.isSafeInteger(adjustmentMinor) ||
              adjustmentMinor <= 0 ||
              props.reason.trim().length === 0 ||
              props.adjustment.phase.kind === "sending"
            }
            onClick={props.onAdjust}
          >
            Ghi điều chỉnh
          </Button>
          <CommandOutcome
            command={props.adjustment}
            attemptedAction="Điều chỉnh công nợ nhà cung cấp"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
    </div>
  );
}
