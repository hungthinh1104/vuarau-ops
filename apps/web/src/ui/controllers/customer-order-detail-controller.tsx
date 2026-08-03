"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  cancelCustomerOrderCommandSchema,
  confirmCustomerOrderCommandSchema,
  customerOrderIdSchema,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CustomerOrderDetailView } from "@/ui/screens/customer-order-detail-view.tsx";

export function CustomerOrderDetailController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const params = useParams<{ orderId: string }>();
  const orderId = customerOrderIdSchema.parse(params.orderId);
  const [reason, setReason] = useState("");
  const order = useQuery(
    trpc.customerOrder.get.queryOptions({ workspaceId, customerOrderId: orderId }),
  );
  const confirmMutation = useMutation(trpc.customerOrder.confirm.mutationOptions());
  const cancelMutation = useMutation(trpc.customerOrder.cancel.mutationOptions());
  const confirm = useContractCommand(
    confirmCustomerOrderCommandSchema,
    confirmMutation.mutateAsync,
  );
  const cancel = useContractCommand(cancelCustomerOrderCommandSchema, cancelMutation.mutateAsync);

  return (
    <CustomerOrderDetailView
      query={order}
      order={order.data ?? null}
      reason={reason}
      canConfirm={session.permissions.includes("customer_order.confirm")}
      canCancel={session.permissions.includes("customer_order.cancel")}
      confirmCommand={confirm}
      cancelCommand={cancel}
      onReasonChange={setReason}
      onRetry={() => void order.refetch()}
      onConfirm={() => {
        if (order.data === null || order.data === undefined) return;
        void confirm
          .submit({ customerOrderId: order.data.id }, { expectedVersion: order.data.version })
          .then(() => void order.refetch());
      }}
      onCancel={() => {
        if (order.data === null || order.data === undefined || reason.trim() === "") return;
        void cancel
          .submit(
            { customerOrderId: order.data.id, reason },
            { expectedVersion: order.data.version },
          )
          .then(() => void order.refetch());
      }}
    />
  );
}
