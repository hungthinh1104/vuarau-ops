"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, PurchaseDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { formatDate, formatMoney } from "@/ui/format.ts";
import { PURCHASE_STATUS_COPY } from "@/ui/copy.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { LinkButton, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";

export default function PurchasesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<PurchaseDto>[]>([]);
  const purchases = useQuery(
    trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (purchases.data === undefined) return;
    setPages((current) => (cursor === null ? [purchases.data] : [...current, purchases.data]));
  }, [cursor, purchases.data]);
  const rows = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Đơn mua"
        actions={
          session.permissions.includes("purchase.create") ? (
            <LinkButton href="/purchases/new">Tạo đơn mua</LinkButton>
          ) : null
        }
      />
      <QueryStates
        query={purchases}
        loadingLabel="Đang tải đơn mua"
        onRetry={() => void purchases.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <EmptyState
              title="Chưa có đơn mua"
              description="Tạo đơn mua đầu tiên khi cần ghi hàng nhập từ nhà cung cấp."
            />
          ) : (
            <>
              <ul className="overflow-hidden rounded-card border border-border bg-surface divide-y divide-border lg:hidden">
                {rows.map((purchase) => (
                  <li key={purchase.id}>
                    <Link
                      href={`/purchases/${purchase.id}`}
                      className="flex min-h-[64px] justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span>
                        <strong>{formatMoney(purchase.totalAmount)}</strong>
                        <span className="block text-caption text-ink-muted">
                          {formatDate(purchase.transactionTime)} · {purchase.lines.length} dòng
                        </span>
                      </span>
                      <Badge
                        tone={
                          purchase.voidRecord !== null
                            ? "warning"
                            : purchase.status === "confirmed"
                              ? "positive"
                              : "neutral"
                        }
                      >
                        {purchase.voidRecord !== null
                          ? "Đã hoàn tác"
                          : PURCHASE_STATUS_COPY[purchase.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-16 z-10 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Ngày</th>
                      <th className="px-3 py-2">Mặt hàng</th>
                      <th className="px-3 py-2">Số dòng</th>
                      <th className="px-3 py-2 text-right">Tổng mua</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((purchase) => (
                      <tr key={purchase.id} className="hover:bg-surface-muted">
                        <td className="px-3 py-2">{formatDate(purchase.transactionTime)}</td>
                        <td className="px-3 py-2">
                          {purchase.lines[0]?.productName ?? "Chưa có hàng"}
                          {purchase.lines.length > 1 ? ` · +${purchase.lines.length - 1}` : ""}
                        </td>
                        <td className="px-3 py-2">{purchase.lines.length}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatMoney(purchase.totalAmount)}
                        </td>
                        <td className="px-3 py-2">
                          {purchase.voidRecord !== null
                            ? "Đã hoàn tác"
                            : PURCHASE_STATUS_COPY[purchase.status]}
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/purchases/${purchase.id}`}
                            className="font-semibold text-info underline-offset-4 hover:underline"
                          >
                            Mở chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        }
      </QueryStates>
      {next !== null ? (
        <LoadMoreFooter
          visibleCount={rows.length}
          noun="đơn mua"
          loading={purchases.isFetching}
          onLoadMore={() => setCursor(next)}
        />
      ) : null}
    </div>
  );
}
