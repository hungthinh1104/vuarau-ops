"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  reverseSupplierPaymentCommandSchema,
  type SupplierPaymentDto,
  type SupplierPaymentId,
  type SupplierPaymentReversalId,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import {
  SupplierPaymentDetailView,
  SupplierPaymentReversalView,
} from "@/ui/screens/supplier-payment-detail-view.tsx";

export function SupplierPaymentDetailController() {
  const paymentId = useParams<{ paymentId: string }>().paymentId as SupplierPaymentId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const payment = useQuery(
    trpc.supplier.getPayment.queryOptions({ workspaceId, supplierPaymentId: paymentId }),
  );
  return (
    <SupplierPaymentDetailView
      query={payment}
      onRetry={() => void payment.refetch()}
      canReverse={session.permissions.includes("supplier.payment.reverse")}
      reversePanel={
        payment.data === undefined ? undefined : (
          <SupplierPaymentReversalController
            payment={payment.data}
            onChanged={() => void payment.refetch()}
          />
        )
      }
    />
  );
}

function SupplierPaymentReversalController({
  payment,
  onChanged,
}: {
  readonly payment: SupplierPaymentDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const reversalId = useRef(crypto.randomUUID() as SupplierPaymentReversalId).current;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const mutation = useMutation(trpc.supplier.reversePayment.mutationOptions());
  const command = useContractCommand(reverseSupplierPaymentCommandSchema, mutation.mutateAsync);
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  const remaining = payment.amount.amountMinor - payment.reversedAmount.amountMinor;
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  return (
    <SupplierPaymentReversalView
      amount={amount}
      reason={reason}
      evidence={evidence}
      remaining={remaining}
      locked={locked}
      onAmountChange={setAmount}
      onReasonChange={setReason}
      onEvidenceChange={setEvidence}
      onSubmit={() => {
        const amountMinor = Math.round(Number(amount) * 1000);
        void command.submit(
          {
            reversalId,
            supplierPaymentId: payment.id,
            amount: { amountMinor, currency: payment.amount.currency },
            reason: reason.trim(),
            evidenceReferences: evidence
              .split(/[\n,]/)
              .map((reference) => reference.trim())
              .filter((reference) => reference.length > 0),
          },
          { expectedVersion: payment.version },
        );
      }}
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác thanh toán nhà cung cấp"
          onReload={onChanged}
        />
      }
    />
  );
}
