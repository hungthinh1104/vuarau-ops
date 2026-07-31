"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { formatMoney, formatQuantity } from "@/ui/format.ts";
import { todayActionsFor } from "@/ui/patterns/today-actions.ts";
import { TodayView, type TodayQueueItem, type TodayQueueState } from "@/ui/screens/today-view.tsx";

export default function TodayPage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const actions = todayActionsFor(session.permissions, session.role);
  const mayReadDeliveries = session.permissions.includes("delivery.read");
  const mayReadPurchases = session.permissions.includes("purchase.read");

  const draftDeliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: "draft",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadDeliveries,
  });
  const dispatchedDeliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: "dispatched",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadDeliveries,
  });
  const openPurchases = useQuery({
    ...trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: "confirmed",
      cursor: null,
      limit: 8,
    }),
    enabled: mayReadPurchases,
  });

  return (
    <TodayView
      actions={actions}
      deliveryQueuesVisible={mayReadDeliveries}
      purchaseQueueVisible={mayReadPurchases}
      draftDeliveries={deliveryQueueState(draftDeliveries, "Cần xuất")}
      dispatchedDeliveries={deliveryQueueState(dispatchedDeliveries, "Đang giao")}
      openPurchases={{
        loading: openPurchases.isLoading,
        error: openPurchases.isError,
        items:
          openPurchases.data?.items.map((purchase) => ({
            id: purchase.id,
            href: `/purchases/${purchase.id}`,
            primary:
              purchase.lines.length === 0
                ? "Đơn mua đã xác nhận"
                : `${purchase.lines[0]!.productName} · ${formatQuantity(purchase.lines[0]!.quantity)}`,
            secondary: `${formatMoney(purchase.totalAmount)}${purchase.lines.length > 1 ? ` · +${purchase.lines.length - 1} mặt hàng` : ""}`,
          })) ?? [],
      }}
    />
  );
}

function deliveryQueueState(
  query: {
    readonly isLoading: boolean;
    readonly isError: boolean;
    readonly data:
      | {
          readonly items: readonly {
            readonly id: string;
            readonly lines: readonly {
              readonly productName: string;
              readonly quantity: Parameters<typeof formatQuantity>[0];
            }[];
          }[];
        }
      | undefined;
  },
  stateLabel: string,
): TodayQueueState {
  return {
    loading: query.isLoading,
    error: query.isError,
    items: query.data?.items.map((delivery) => deliveryQueueItem(delivery, stateLabel)) ?? [],
  };
}

function deliveryQueueItem(
  delivery: {
    readonly id: string;
    readonly lines: readonly {
      readonly productName: string;
      readonly quantity: Parameters<typeof formatQuantity>[0];
    }[];
  },
  stateLabel: string,
): TodayQueueItem {
  const first = delivery.lines[0];
  return {
    id: delivery.id,
    href: `/deliveries/${delivery.id}`,
    primary:
      first === undefined ? stateLabel : `${first.productName} · ${formatQuantity(first.quantity)}`,
    secondary: `${stateLabel}${delivery.lines.length > 1 ? ` · +${delivery.lines.length - 1} mặt hàng` : ""}`,
  };
}
