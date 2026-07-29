"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { formatInstant, formatSignedMoney } from "../../../../ui/format.ts";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";

export default function SupplierAdjustmentPage() {
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const detail = useQuery(trpc.supplier.getAdjustment.queryOptions({ workspaceId, adjustmentId }));
  return (
    <QueryStates
      query={detail}
      loadingLabel="Đang tải điều chỉnh"
      onRetry={() => void detail.refetch()}
    >
      {(entry) => (
        <div className="flex max-w-2xl flex-col gap-4">
          <h1 className="text-heading font-bold">Điều chỉnh công nợ nhà cung cấp</h1>
          <dl className="grid grid-cols-2 gap-2 rounded-card border border-border bg-surface p-4">
            <dt>Thay đổi</dt>
            <dd className="text-right font-bold">{formatSignedMoney(entry.amount)}</dd>
            <dt>Mã lý do</dt>
            <dd className="text-right">{entry.reasonCode}</dd>
            <dt>Giải thích</dt>
            <dd className="text-right">{entry.reason}</dd>
            <dt>Thời điểm giao dịch</dt>
            <dd className="text-right">{formatInstant(entry.transactionTime)}</dd>
            <dt>Ghi nhận</dt>
            <dd className="text-right">{formatInstant(entry.recordedAt)}</dd>
            <dt>Command</dt>
            <dd className="break-all text-right">{entry.commandId}</dd>
          </dl>
          <Link href={`/suppliers/${entry.supplierId}`} className="text-info underline">
            Mở nhà cung cấp
          </Link>
        </div>
      )}
    </QueryStates>
  );
}
