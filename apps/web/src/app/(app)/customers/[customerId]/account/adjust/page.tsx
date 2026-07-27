"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { CustomerId, CustomerAccountBalanceDto } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "../../../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../../../api/providers.tsx";
import { useCommand } from "../../../../../../api/use-command.ts";
import { hasPermission } from "../../../../../../api/session.ts";
import { QueryStates } from "../../../../../../ui/patterns/query-states.tsx";
import { CommandOutcome } from "../../../../../../ui/patterns/command-outcome.tsx";
import { PermissionDenied } from "../../../../../../ui/patterns/permission-denied.tsx";
import { DebtAdjustmentForm } from "../../../../../../ui/patterns/debt-adjustment-form.tsx";

export default function AdjustCustomerAccountPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const adjust = useMutation(trpc.debt.adjust.mutationOptions());
  const command = useCommand<unknown, CustomerAccountBalanceDto>(
    (envelope) => adjust.mutateAsync(envelope as never) as Promise<CustomerAccountBalanceDto>,
  );
  const mayAdjust = hasPermission(session, "debt.adjust");
  // This identifies one intended adjustment for the lifetime of this screen.
  // `useCommand` preserves its command/idempotency identity for a resend; this
  // id preserves the domain source identity too, including an unknown outcome.
  const adjustmentId = useRef(crypto.randomUUID()).current;

  useEffect(() => {
    if (command.phase.kind === "succeeded") {
      router.replace(`/account-adjustments/${adjustmentId}`);
    }
  }, [adjustmentId, command.phase.kind, router]);
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-heading font-bold">Điều chỉnh công nợ</h1>
      <QueryStates
        query={customer}
        loadingLabel="Đang tải công nợ"
        attemptedAction="Điều chỉnh công nợ"
        onRetry={() => void customer.refetch()}
      >
        {() => (
          <>
            {!mayAdjust ? (
              <PermissionDenied
                error={{
                  code: "PERMISSION_DENIED",
                  message: "Role does not carry permission 'debt.adjust'.",
                  details: { permission: "debt.adjust", role: session.role },
                  retryable: false,
                }}
                attemptedAction="Điều chỉnh công nợ"
              />
            ) : (
              <DebtAdjustmentForm
                disabled={command.phase.kind === "sending" || command.phase.kind === "succeeded"}
                onSubmit={({ direction, reasonCode, amountMinor, reason }) => {
                  void command.submit({
                    adjustmentId,
                    customerId,
                    direction,
                    reasonCode,
                    amount: { amountMinor, currency: "VND" },
                    reason,
                  });
                }}
              />
            )}
            <CommandOutcome
              command={command}
              attemptedAction="Điều chỉnh công nợ"
              onReload={() => void customer.refetch()}
              onCancel={() => router.push(`/customers/${customerId}`)}
            />
          </>
        )}
      </QueryStates>
    </div>
  );
}
