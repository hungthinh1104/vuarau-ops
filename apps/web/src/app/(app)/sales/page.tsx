"use client";

import { useQuery } from "@tanstack/react-query";
import type { SaleSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTRPC } from "../../../api/providers.tsx";
import { useSession } from "../../../api/session-gate.tsx";
import {
  pageStateForWorkspace,
  type WorkspacePageState,
} from "../../../api/workspace-page-state.ts";
import { formatInstant, formatMoney } from "../../../ui/format.ts";
import { PageActions, PageHeader, LinkButton } from "../../../ui/patterns/page-layout.tsx";
import { QueryStates } from "../../../ui/patterns/query-states.tsx";
import { Badge } from "../../../ui/primitives/badge.tsx";
import { Button } from "../../../ui/primitives/button.tsx";

export default function SalesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [pageState, setPageState] = useState<WorkspacePageState<SaleSummaryDto>>({
    workspaceId,
    cursor: null,
    pages: [],
  });
  const visible = pageStateForWorkspace(pageState, workspaceId);
  const sales = useQuery(
    trpc.sale.list.queryOptions({
      workspaceId,
      customerId: null,
      status: null,
      financialState: null,
      from: null,
      to: null,
      cursor: visible.cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (sales.data === undefined) return;
    setPageState((current) => {
      const scoped = pageStateForWorkspace(current, workspaceId);
      return {
        workspaceId,
        cursor: scoped.cursor,
        pages: scoped.cursor === null ? [sales.data] : [...scoped.pages, sales.data],
      };
    });
  }, [sales.data, workspaceId]);
  const rows = visible.pages.flatMap((page) => page.items);
  const next = visible.pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Đơn hàng"
        description="Danh sách Sale do server đọc từ dữ liệu nghiệp vụ của vựa."
        actions={
          session.permissions.includes("sale.create") ? (
            <PageActions>
              <LinkButton href="/sales/new">Ghi đơn nhanh</LinkButton>
            </PageActions>
          ) : undefined
        }
      />
      <QueryStates
        query={sales}
        loadingLabel="Đang tải đơn hàng"
        onRetry={() => void sales.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <p>Chưa có đơn hàng.</p>
          ) : (
            <>
              <ul className="grid gap-2 lg:hidden">
                {rows.map((sale) => (
                  <li key={sale.id}>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface p-4"
                    >
                      <span>
                        <strong>{sale.customerDisplayName}</strong>
                        <span className="block text-caption text-ink-muted">
                          {formatInstant(sale.transactionTime)} · {sale.lineCount} dòng
                        </span>
                      </span>
                      <span className="text-right">
                        <strong className="block">{formatMoney(sale.totalAmount)}</strong>
                        <Badge tone={sale.financialState === "voided" ? "warning" : "neutral"}>
                          {sale.financialState === "voided" ? "Đã hoàn tác" : sale.status}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full border-collapse text-left text-body-sm">
                  <thead className="sticky top-0 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Thời điểm</th>
                      <th className="px-3 py-2">Khách hàng</th>
                      <th className="px-3 py-2">Số dòng</th>
                      <th className="px-3 py-2 text-right">Tổng đơn</th>
                      <th className="px-3 py-2">Công nợ</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((sale) => (
                      <tr key={sale.id} className="hover:bg-surface-muted">
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatInstant(sale.transactionTime)}
                        </td>
                        <td className="px-3 py-2 font-medium">{sale.customerDisplayName}</td>
                        <td className="px-3 py-2">{sale.lineCount}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold">
                          {formatMoney(sale.totalAmount)}
                        </td>
                        <td className="px-3 py-2">{sale.financialState}</td>
                        <td className="px-3 py-2">{sale.status}</td>
                        <td className="px-3 py-2">
                          <Link href={`/sales/${sale.id}`} className="text-info underline">
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
      {next === null ? null : (
        <Button
          tone="secondary"
          disabled={sales.isFetching}
          onClick={() => setPageState({ ...visible, cursor: next })}
        >
          {sales.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      )}
    </div>
  );
}
