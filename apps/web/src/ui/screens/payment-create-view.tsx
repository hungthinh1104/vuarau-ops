"use client";

import type { CustomerDetailDto, CustomerId, Money, PaymentMethod } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

const METHOD_OPTIONS = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "other", label: "Khác" },
] as const;

export type PaymentCreateViewProps = {
  readonly customerId: CustomerId;
  readonly customer: QueryLike<CustomerDetailDto>;
  readonly canRecord: boolean;
  readonly role: string;
  readonly amountText: string;
  readonly amount: Money | null;
  readonly amountError: string | undefined;
  readonly method: PaymentMethod;
  readonly payerName: string;
  readonly note: string;
  readonly command: CommandOutcomeView;
  readonly onAmount: (value: string) => void;
  readonly onMethod: (value: PaymentMethod) => void;
  readonly onPayerName: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
};

export function PaymentCreateView(props: PaymentCreateViewProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ghi nhận thanh toán"
        back={{ href: `/customers/${props.customerId}`, label: "Khách hàng" }}
      />
      <QueryStates
        query={props.customer}
        loadingLabel="Đang tải công nợ khách hàng"
        attemptedAction="Xem công nợ khách hàng"
        onRetry={props.onRetry}
      >
        {(detail) => (
          <>
            <section className="border-y border-border py-3">
              <p className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
                Khách hàng
              </p>
              <p className="mt-1 text-subheading font-semibold text-ink">
                {detail.customer.displayName}
              </p>
              {detail.customer.phone !== null ? (
                <p className="text-caption text-ink-muted">{detail.customer.phone}</p>
              ) : null}
            </section>

            {!props.canRecord ? (
              <PermissionDenied
                error={{
                  code: "PERMISSION_DENIED",
                  message: "Role does not carry permission 'payment.record'.",
                  details: { permission: "payment.record", role: props.role },
                  retryable: false,
                }}
                attemptedAction="Ghi nhận thanh toán"
              />
            ) : null}

            <MoneyInput
              label="Số tiền khách trả"
              currency="VND"
              required
              inputMode="numeric"
              value={props.amountText}
              onChange={(event) => props.onAmount(event.target.value)}
              {...(props.amountError !== undefined ? { error: props.amountError } : {})}
              autoFocus
            />
            {props.amount !== null && props.amount.amountMinor > 0 ? (
              <BalancePreview
                currentBalance={detail.balance}
                currentClassification={detail.classification}
                change={{ amountMinor: -props.amount.amountMinor, currency: props.amount.currency }}
                changeLabel="Khách trả"
              />
            ) : null}
            <Select
              label="Hình thức"
              value={props.method}
              onChange={(event) => props.onMethod(event.target.value as PaymentMethod)}
              options={METHOD_OPTIONS}
            />
            <TextInput
              label="Người trả (nếu không phải khách)"
              value={props.payerName}
              onChange={(event) => props.onPayerName(event.target.value)}
              hint="Ví dụ: con hoặc tài xế của khách trả thay."
            />
            <Textarea
              label="Ghi chú"
              value={props.note}
              onChange={(event) => props.onNote(event.target.value)}
              rows={2}
            />
            <CommandOutcome
              command={props.command}
              attemptedAction="Ghi nhận thanh toán"
              onReload={props.onRetry}
              onCancel={props.onCancel}
            />
            <div className="sticky bottom-16 -mx-4 border-t border-border bg-surface px-4 py-3 lg:bottom-0">
              <Button
                fullWidth
                onClick={props.onSubmit}
                {...(!props.canRecord
                  ? { disabledReason: "Bạn không có quyền ghi nhận thanh toán." }
                  : props.command.phase.kind === "sending"
                    ? { disabledReason: "Đang gửi…" }
                    : props.command.phase.kind === "succeeded"
                      ? { disabledReason: "Đã ghi nhận." }
                      : {})}
              >
                Ghi nhận thanh toán
              </Button>
            </div>
          </>
        )}
      </QueryStates>
    </div>
  );
}
