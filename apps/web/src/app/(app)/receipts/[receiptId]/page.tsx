"use client";

import { useQuery } from "@tanstack/react-query";
import type { PurchaseReceiptId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { formatInstant, formatQuantity } from "../../../../ui/format.ts";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../../ui/primitives/badge.tsx";

export default function ReceiptDetailPage() {
  const receiptId = useParams<{ receiptId: string }>().receiptId as PurchaseReceiptId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const receipt = useQuery(trpc.receiving.get.queryOptions({ workspaceId, receiptId }));
  return (
    <QueryStates
      query={receipt}
      loadingLabel="Đang tải phiếu nhận"
      onRetry={() => void receipt.refetch()}
    >
      {(detail) => (
        <div className="flex max-w-3xl flex-col gap-4">
          <header>
            <h1 className="text-heading font-bold">
              Phiếu nhận {detail.id.slice(0, 8).toUpperCase()}
            </h1>
            <p className="text-caption text-ink-muted">
              {formatInstant(detail.transactionTime)}
              {detail.recordedAt === detail.transactionTime
                ? ""
                : ` · ghi ${formatInstant(detail.recordedAt)}`}
            </p>
          </header>
          <Link href={`/purchases/${detail.purchaseId}`} className="text-info underline">
            Mở đơn mua nguồn
          </Link>
          <ul className="flex flex-col gap-2">
            {detail.lines.map((line) => (
              <li
                key={line.receiptLineId}
                className="rounded-card border border-border bg-surface p-3"
              >
                <Link
                  href={`/products/${line.productId}/inventory`}
                  className="font-semibold text-info underline"
                >
                  Mặt hàng {line.productId.slice(0, 8).toUpperCase()}
                </Link>
                <p>{formatQuantity(line.quantity)}</p>
              </li>
            ))}
          </ul>
          {detail.reversal === null ? (
            <Badge tone="positive">Đang có hiệu lực</Badge>
          ) : (
            <section className="rounded-card border border-warning/40 bg-warning-soft p-4">
              <Badge tone="warning">Đã hoàn tác</Badge>
              <p>
                {detail.reversal.reasonCode}: {detail.reversal.reason}
              </p>
            </section>
          )}
        </div>
      )}
    </QueryStates>
  );
}
