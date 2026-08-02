"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  recordCustomerPaymentCommandSchema,
  type CustomerId,
  type PaymentId,
  type PaymentMethod,
} from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { parseMoneyText } from "@/ui/domain/numeric-text.ts";
import { PaymentCreateView } from "@/ui/screens/payment-create-view.tsx";

export function PaymentCreateController() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const [amountText, setAmountText] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [payerName, setPayerName] = useState("");
  const [note, setNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const record = useMutation(trpc.payment.record.mutationOptions());
  const command = useContractCommand(recordCustomerPaymentCommandSchema, record.mutateAsync);
  const parsed = parseMoneyText(amountText, "VND");
  const amount = parsed.ok ? parsed.value : null;
  const amountError = !parsed.ok
    ? parsed.reason
    : !submitted
      ? undefined
      : amount === null
        ? "Nhập số tiền khách trả."
        : amount.amountMinor <= 0
          ? "Số tiền phải lớn hơn 0."
          : undefined;
  const canRecord = hasPermission(session, "payment.record");

  useEffect(() => {
    if (command.phase.kind === "succeeded" && command.result !== null) {
      router.replace(`/payments/${command.result.id}`);
    }
  }, [command.phase.kind, command.result, router]);

  return (
    <PaymentCreateView
      customerId={customerId}
      customer={customer}
      canRecord={canRecord}
      role={session.role}
      amountText={amountText}
      amount={amount}
      amountError={amountError}
      method={method}
      payerName={payerName}
      note={note}
      command={command}
      onAmount={setAmountText}
      onMethod={setMethod}
      onPayerName={setPayerName}
      onNote={setNote}
      onSubmit={() => {
        setSubmitted(true);
        if (amount === null || amount.amountMinor <= 0) return;
        void command.submit({
          paymentId: crypto.randomUUID() as PaymentId,
          customerId,
          amount,
          method,
          payerName: payerName.trim().length === 0 ? null : payerName.trim(),
          note: note.trim().length === 0 ? null : note.trim(),
        });
      }}
      onRetry={() => void customer.refetch()}
      onCancel={() => router.push(`/customers/${customerId}`)}
    />
  );
}
