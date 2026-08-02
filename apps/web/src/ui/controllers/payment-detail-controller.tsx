"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  reverseCustomerPaymentCommandSchema,
  type CustomerId,
  type PaymentId,
  type PaymentReversalId,
  type WorkspaceId,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { hasPermission } from "@/api/session.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PaymentReversalPanel } from "@/ui/patterns/payment/payment-reversal-panel.tsx";
import { BalanceCard } from "@/ui/patterns/finance/balance-card.tsx";
import { PaymentDetailView } from "@/ui/screens/payment-detail-view.tsx";

export function PaymentDetailController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const paymentId = useParams<{ paymentId: string }>().paymentId as PaymentId;
  const payment = useQuery(trpc.payment.get.queryOptions({ workspaceId, paymentId }));
  const reverse = useMutation(trpc.payment.reverse.mutationOptions());
  const reverseCommand = useContractCommand(
    reverseCustomerPaymentCommandSchema,
    reverse.mutateAsync,
  );

  return (
    <PaymentDetailView
      query={payment}
      onRetry={() => void payment.refetch()}
      canReverse={
        payment.data !== undefined &&
        hasPermission(session, "payment.reverse") &&
        payment.data.capabilities.reverse.allowed
      }
      balance={
        payment.data === undefined ? null : (
          <CustomerBalanceController
            workspaceId={workspaceId}
            customerId={payment.data.customerId}
            customerName={payment.data.customerDisplayName}
          />
        )
      }
      reversal={
        payment.data === undefined ? undefined : (
          <>
            <PaymentReversalPanel
              remainingAmountMinor={payment.data.remainingReversibleAmount.amountMinor}
              onSubmit={({ amountMinor, reason }) => {
                void reverseCommand.submit(
                  {
                    paymentId: payment.data!.id,
                    reversalId: crypto.randomUUID() as PaymentReversalId,
                    amount: { amountMinor, currency: payment.data!.amount.currency },
                    reason,
                  },
                  { expectedVersion: payment.data!.version },
                );
              }}
              disabled={
                reverseCommand.phase.kind === "sending" || reverseCommand.phase.kind === "succeeded"
              }
            />
            <CommandOutcome
              command={reverseCommand}
              attemptedAction="Hoàn tác thanh toán"
              onReload={() => void payment.refetch()}
            />
          </>
        )
      }
    />
  );
}

function CustomerBalanceController({
  workspaceId,
  customerId,
  customerName,
}: {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly customerName: string;
}) {
  const trpc = useTRPC();
  const balance = useQuery(
    trpc.account.balance.queryOptions({
      workspaceId,
      customerId,
    }),
  );
  return (
    <QueryStates
      query={balance}
      loadingLabel="Đang tải công nợ"
      attemptedAction="Xem công nợ"
      onRetry={() => void balance.refetch()}
    >
      {(current) => (
        <BalanceCard
          customerName={customerName}
          balance={current.balance}
          classification={current.classification}
          lastEntryTransactionTime={current.lastEntryTransactionTime}
        />
      )}
    </QueryStates>
  );
}
