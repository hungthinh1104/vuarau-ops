"use client";

import type { PurchaseReceiptDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";

export function ReceiptDetailView({
  query,
  onRetry,
}: {
  readonly query: QueryLike<PurchaseReceiptDto>;
  readonly onRetry: () => void;
}) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải phiếu nhận" onRetry={onRetry}>
      {(detail) => (
        <div className="flex max-w-3xl flex-col gap-4">
          <PageHeader
            title={`Phiếu nhận ${detail.id.slice(0, 8).toUpperCase()}`}
            description={`${formatInstant(detail.transactionTime)}${
              detail.recordedAt === detail.transactionTime
                ? ""
                : ` · ghi ${formatInstant(detail.recordedAt)}`
            }`}
            back={{ href: `/purchases/${detail.purchaseId}`, label: "Mở đơn mua nguồn" }}
          />
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
                <p>
                  {line.qualityGradeName} · {formatQuantity(line.quantity)}
                </p>
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
