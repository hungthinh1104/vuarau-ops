"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { adjustCustomerDebtCommandSchema, type CustomerId } from "@vuarau/domain-contracts";
import { useParams, useRouter } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { hasPermission } from "@/api/session.ts";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CustomerAccountAdjustView } from "@/ui/screens/customer-account-adjust-view.tsx";

export function CustomerAccountAdjustController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const customer = useQuery(trpc.customer.get.queryOptions({ workspaceId, customerId }));
  const adjust = useMutation(trpc.debt.adjust.mutationOptions());
  const command = useContractCommand(adjustCustomerDebtCommandSchema, adjust.mutateAsync);
  const adjustmentId = useRef(crypto.randomUUID()).current;

  useEffect(() => {
    if (command.phase.kind === "succeeded") {
      router.replace(`/account-adjustments/${adjustmentId}`);
    }
  }, [adjustmentId, command.phase.kind, router]);

  return (
    <CustomerAccountAdjustView
      customerId={customerId}
      customer={customer}
      canAdjust={hasPermission(session, "debt.adjust")}
      role={session.role}
      command={command}
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
      onRetry={() => void customer.refetch()}
      onCancel={() => router.push(`/customers/${customerId}`)}
    />
  );
}
