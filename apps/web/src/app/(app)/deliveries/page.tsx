"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeliveryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { pageStateForWorkspace, type WorkspacePageState } from "@/api/workspace-page-state.ts";
import { formatInstant } from "@/ui/format.ts";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";

const STATUS = {
  draft: "Nháp",
  cancelled: "Đã hủy",
  dispatched: "Đang giao",
  delivered: "Đã giao",
} as const;

export default function DeliveriesPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const [pageState, setPageState] = useState<WorkspacePageState<DeliveryDto>>({
    workspaceId,
    cursor: null,
    pages: [],
  });
  const visible = pageStateForWorkspace(pageState, workspaceId);
  const deliveries = useQuery(
    trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: null,
      cursor: visible.cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (deliveries.data === undefined) return;
    setPageState((current) => {
      const scoped = pageStateForWorkspace(current, workspaceId);
      return {
        workspaceId,
        cursor: scoped.cursor,
        pages: scoped.cursor === null ? [deliveries.data] : [...scoped.pages, deliveries.data],
      };
    });
  }, [deliveries.data, workspaceId]);
  const rows = visible.pages.flatMap((page) => page.items);
  const next = visible.pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Giao hàng"
        description="Phiếu giao hiện có; trạng thái và dòng hàng đến từ read model server."
      />
      <QueryStates
        query={deliveries}
        loadingLabel="Đang tải phiếu giao"
        onRetry={() => void deliveries.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <p>Chưa có phiếu giao hàng.</p>
          ) : (
            <>
              <ul className="grid gap-2 lg:hidden">
                {rows.map((delivery) => (
                  <li key={delivery.id}>
                    <Link
                      href={`/deliveries/${delivery.id}`}
                      className="flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
                    >
                      <span>
                        <strong>Phiếu {delivery.id.slice(0, 8)}</strong>
                        <span className="block text-caption text-ink-muted">
                          {formatInstant(delivery.transactionTime)} · {delivery.lines.length} dòng
                        </span>
                      </span>
                      <Badge
                        tone={
                          delivery.status === "dispatched"
                            ? "info"
                            : delivery.status === "cancelled"
                              ? "warning"
                              : delivery.status === "delivered"
                                ? "positive"
                                : "neutral"
                        }
                      >
                        {STATUS[delivery.status]}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-0 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Phiếu</th>
                      <th className="px-3 py-2">Đơn bán</th>
                      <th className="px-3 py-2">Thời điểm</th>
                      <th className="px-3 py-2">Số dòng</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((delivery) => (
                      <tr key={delivery.id} className="hover:bg-surface-muted">
                        <td className="px-3 py-2 font-medium">
                          {delivery.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/sales/${delivery.saleId}`} className="text-info underline">
                            {delivery.saleId.slice(0, 8).toUpperCase()}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatInstant(delivery.transactionTime)}
                        </td>
                        <td className="px-3 py-2">{delivery.lines.length}</td>
                        <td className="px-3 py-2">{STATUS[delivery.status]}</td>
                        <td className="px-3 py-2">
                          <Link href={`/deliveries/${delivery.id}`} className="text-info underline">
                            Mở phiếu
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
      {next === null ? null : (
        <Button
          tone="secondary"
          disabled={deliveries.isFetching}
          onClick={() => setPageState({ ...visible, cursor: next })}
        >
          {deliveries.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}
