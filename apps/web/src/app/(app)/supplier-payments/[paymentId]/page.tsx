"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { SupplierPaymentDto, SupplierPaymentId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { formatInstant, formatMoney } from "../../../../ui/format.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";
import { Button } from "../../../../ui/primitives/button.tsx";
import { INPUT_CLASS } from "../../../../ui/primitives/field.tsx";

export default function SupplierPaymentPage() {
  const paymentId = useParams<{ paymentId: string }>().paymentId as SupplierPaymentId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const payment = useQuery(
    trpc.supplier.getPayment.queryOptions({
      workspaceId,
      supplierPaymentId: paymentId,
    }),
  );
  return (
    <QueryStates
      query={payment}
      loadingLabel="Đang tải thanh toán"
      onRetry={() => void payment.refetch()}
    >
      {(detail) => (
        <div className="flex max-w-2xl flex-col gap-4">
          <header>
            <h1 className="text-heading font-bold">Thanh toán nhà cung cấp</h1>
            <Badge tone={detail.status === "recorded" ? "positive" : "warning"}>
              {detail.status}
            </Badge>
          </header>
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Số tiền</dt>
            <dd className="text-right font-bold">{formatMoney(detail.amount)}</dd>
            <dt>Đã hoàn tác</dt>
            <dd className="text-right">{formatMoney(detail.reversedAmount)}</dd>
            <dt>Phương thức</dt>
            <dd className="text-right">{detail.method}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(detail.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(detail.recordedAt)}</dd>
          </dl>
          {detail.note === null ? null : <p>{detail.note}</p>}
          <Link href={`/suppliers/${detail.supplierId}`} className="text-info underline">
            Mở nhà cung cấp
          </Link>
          {session.permissions.includes("supplier.payment.reverse") &&
          detail.status !== "reversed" ? (
            <ReversePayment payment={detail} onChanged={() => void payment.refetch()} />
          ) : null}
        </div>
      )}
    </QueryStates>
  );
}

function ReversePayment(props: { payment: SupplierPaymentDto; onChanged: () => void }) {
  const trpc = useTRPC();
  const reversalId = useRef(crypto.randomUUID()).current;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const mutation = useMutation(trpc.supplier.reversePayment.mutationOptions());
  const command = useCommand<unknown, SupplierPaymentDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (command.result !== null) props.onChanged();
  }, [command.result, props]);
  const amountMinor = Math.round(Number(amount) * 1000);
  const remaining = props.payment.amount.amountMinor - props.payment.reversedAmount.amountMinor;
  return (
    <section className="rounded-card border border-warning/40 p-4">
      <h2 className="font-semibold">Hoàn tác thanh toán</h2>
      <label className="text-label">
        Số tiền (nghìn đồng)
        <input
          className={INPUT_CLASS}
          inputMode="numeric"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label className="text-label">
        Giải thích
        <textarea
          className={INPUT_CLASS}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button
        tone="secondary"
        disabled={amountMinor <= 0 || amountMinor > remaining || reason.trim().length === 0}
        onClick={() =>
          void command.submit(
            {
              reversalId,
              supplierPaymentId: props.payment.id,
              amount: { amountMinor, currency: props.payment.amount.currency },
              reason: reason.trim(),
            },
            { expectedVersion: props.payment.version },
          )
        }
      >
        Hoàn tác
      </Button>
      <CommandOutcome
        command={command}
        attemptedAction="Hoàn tác thanh toán nhà cung cấp"
        onReload={props.onChanged}
      />
    </section>
  );
}
