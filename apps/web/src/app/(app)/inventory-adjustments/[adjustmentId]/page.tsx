"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export default function InventoryAdjustmentPage() {
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const detail = useQuery(trpc.inventory.getAdjustment.queryOptions({ workspaceId, adjustmentId }));
  return (
    <QueryStates
      query={detail}
      loadingLabel="Đang tải điều chỉnh kho"
      onRetry={() => void detail.refetch()}
    >
      {(movement) => (
        <div className="flex max-w-2xl flex-col gap-4">
          <PageHeader
            title="Điều chỉnh tồn kho"
            back={{
              href: `/products/${movement.productId}/inventory`,
              label: "Mở sổ kho mặt hàng",
            }}
          />
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Thay đổi</dt>
            <dd className="text-right font-bold">{formatQuantity(movement.quantity)}</dd>
            <dt>Mã lý do</dt>
            <dd className="text-right">{movement.reasonCode}</dd>
            <dt>Giải thích</dt>
            <dd className="text-right">{movement.reason}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(movement.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(movement.recordedAt)}</dd>
            <dt>Command</dt>
            <dd className="break-all text-right">{movement.commandId}</dd>
          </dl>
        </div>
      )}
    </QueryStates>
  );
}
