"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerId, Money, PaymentMethod } from "@vuarau/domain-contracts";
import { useRouter } from "next/navigation";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { hasPermission } from "@/api/session.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { BalancePreview } from "@/ui/patterns/finance/balance-preview.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { parseMoneyText } from "@/ui/primitives/numeric-text.ts";

const METHOD_OPTIONS = [
  { value: "cash", label: "Tiền mặt" },
  { value: "bank_transfer", label: "Chuyển khoản" },
  { value: "other", label: "Khác" },
];

/**
 * Recording a payment: the highest-frequency money command in a depot, and the
 * one where every exception state occurs naturally at a market.
 *
 * The whole screen is built around one rule — **the entered data outlives every
 * recoverable failure**. Amount, method, payer and note live in this component's
 * state as raw text, not derived from a parsed value, so a rejection, a version
 * conflict or a dropped connection re-renders the same strings the worker typed.
 * Losing a 3 a.m. entry to a network blip is how people go back to paper.
 */
export default function NewPaymentPage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const params = useParams<{ customerId: string }>();
  const customerId = params.customerId as CustomerId;

  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));

  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const record = useMutation(trpc.payment.record.mutationOptions());
  const command = useCommand<
    {
      paymentId: string;
      customerId: CustomerId;
      amount: Money;
      method: PaymentMethod;
      payerName: string | null;
      note: string | null;
    },
    { id: string }
  >((envelope) => record.mutateAsync(envelope as never) as Promise<{ id: string }>);

  const parsed = parseMoneyText(amountText, "VND");
  const amount = parsed.ok ? parsed.value : null;

  // Shown only after a submit attempt: flagging an empty field somebody has not
  // reached yet is noise, and noise trains people to ignore the real one.
  const amountError = !parsed.ok
    ? parsed.reason
    : !submitted
      ? undefined
      : amount === null
        ? "Nhập số tiền khách trả."
        : amount.amountMinor <= 0
          ? "Số tiền phải lớn hơn 0."
          : undefined;

  const mayRecord = hasPermission(session, "payment.record");

  async function submit(): Promise<void> {
    setSubmitted(true);
    if (amount === null || amount.amountMinor <= 0) return;

    await command.submit({
      paymentId: crypto.randomUUID(),
      customerId,
      amount,
      method,
      payerName: payerName.trim().length === 0 ? null : payerName.trim(),
      note: note.trim().length === 0 ? null : note.trim(),
    });
  }

  if (command.phase.kind === "succeeded" && command.result !== null) {
    router.replace(`/payments/${command.result.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Ghi nhận thanh toán"
        back={{ href: `/customers/${customerId}`, label: "Khách hàng" }}
      />

      <QueryStates
        query={customer}
        loadingLabel="Đang tải công nợ khách hàng"
        attemptedAction="Xem công nợ khách hàng"
        onRetry={() => void customer.refetch()}
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

            {!mayRecord ? (
              <PermissionDenied
                error={{
                  code: "PERMISSION_DENIED",
                  message: "Role does not carry permission 'payment.record'.",
                  details: { permission: "payment.record", role: session.role },
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
              value={amountText}
              onChange={(event) => setAmountText(event.target.value)}
              {...(amountError !== undefined ? { error: amountError } : {})}
              autoFocus
            />

            {amount !== null && amount.amountMinor > 0 ? (
              <BalancePreview
                currentBalance={detail.balance}
                currentClassification={detail.classification}
                // Negative: a payment reduces what the customer owes.
                change={{ amountMinor: -amount.amountMinor, currency: amount.currency }}
                changeLabel="Khách trả"
              />
            ) : null}

            <Select
              label="Hình thức"
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              options={METHOD_OPTIONS}
            />

            <TextInput
              label="Người trả (nếu không phải khách)"
              value={payerName}
              onChange={(event) => setPayerName(event.target.value)}
              hint="Ví dụ: con hoặc tài xế của khách trả thay."
            />

            <Textarea
              label="Ghi chú"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
            />

            <CommandOutcome
              command={command}
              attemptedAction="Ghi nhận thanh toán"
              onReload={() => void customer.refetch()}
              onCancel={() => router.push(`/customers/${customerId}`)}
            />

            <div className="sticky bottom-16 -mx-4 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:bottom-0">
              <Button
                fullWidth
                onClick={() => void submit()}
                {...(!mayRecord
                  ? { disabledReason: "Bạn không có quyền ghi nhận thanh toán." }
                  : command.phase.kind === "sending"
                    ? { disabledReason: "Đang gửi…" }
                    : // Stays disabled after the server said yes. The route change
                      // that follows is not instant, and a second tap on a screen
                      // that has already succeeded is not a second payment.
                      command.phase.kind === "succeeded"
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
