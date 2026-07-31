"use client";

import { useQuery } from "@tanstack/react-query";
import type { SaleSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { pageStateForWorkspace, type WorkspacePageState } from "@/api/workspace-page-state.ts";
import { formatInstant, formatMoney } from "@/ui/format.ts";
import { PageActions, PageHeader, LinkButton } from "@/ui/patterns/layout/page-layout.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";

export default function SalesPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<"all" | "draft" | "posted" | "voided">("all");
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
      status:
        filter === "draft" ? "draft" : filter === "posted" || filter === "voided" ? "posted" : null,
      financialState: filter === "voided" ? "voided" : filter === "posted" ? "active" : null,
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
    <div className="grid gap-6">
      <PageHeader
        title="Đơn hàng"
        description="Các đơn đã ghi trong vựa, gồm đơn nháp, đã chốt và đã hoàn tác."
        actions={
          session.permissions.includes("sale.create") ? (
            <PageActions>
              <LinkButton href="/sales/new">Ghi đơn nhanh</LinkButton>
            </PageActions>
          ) : undefined
        }
      />
      <div className="border-y border-border py-4">
        <FilterChipGroup
          label="Lọc trạng thái đơn hàng"
          value={filter}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "draft", label: "Nháp" },
            { value: "posted", label: "Đã chốt" },
            { value: "voided", label: "Đã hoàn tác" },
          ]}
          onChange={(value) => {
            setFilter(value);
            setPageState({ workspaceId, cursor: null, pages: [] });
          }}
        />
      </div>
      <QueryStates
        query={sales}
        loadingLabel="Đang tải đơn hàng"
        onRetry={() => void sales.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <EmptyState
              title="Chưa có đơn hàng"
              description="Ghi đơn đầu tiên để bắt đầu theo dõi bán hàng và công nợ."
            />
          ) : (
            <>
              <ul className="overflow-hidden rounded-card border border-border bg-surface divide-y divide-border lg:hidden">
                {rows.map((sale) => (
                  <li key={sale.id}>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="flex min-h-[64px] flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <span>
                        <strong>{sale.customerDisplayName}</strong>
                        <span className="block text-caption text-ink-muted">
                          {formatInstant(sale.transactionTime)} · {sale.lineCount} dòng
                        </span>
                      </span>
                      <span className="text-right">
                        <strong className="block">{formatMoney(sale.totalAmount)}</strong>
                        <Badge
                          tone={
                            sale.financialState === "voided"
                              ? "warning"
                              : sale.status === "posted"
                                ? "positive"
                                : "neutral"
                          }
                        >
                          {sale.financialState === "voided"
                            ? "Đã hoàn tác"
                            : sale.status === "posted"
                              ? "Đã chốt"
                              : sale.status === "draft"
                                ? "Nháp"
                                : "Đã bỏ"}
                        </Badge>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full border-collapse text-left text-body-sm">
                  <thead className="sticky top-16 z-10 bg-surface-muted text-label">
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
                        <td className="px-3 py-2">
                          {sale.financialState === "voided"
                            ? "Đã hoàn tác"
                            : sale.financialState === "active"
                              ? "Còn hiệu lực"
                              : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <Badge
                            tone={
                              sale.status === "posted"
                                ? "positive"
                                : sale.status === "draft"
                                  ? "info"
                                  : "neutral"
                            }
                          >
                            {sale.status === "posted"
                              ? "Đã chốt"
                              : sale.status === "draft"
                                ? "Nháp"
                                : "Đã bỏ"}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/sales/${sale.id}`}
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
          noun="đơn hàng"
          loading={sales.isFetching}
          onLoadMore={() => setPageState({ ...visible, cursor: next })}
        />
      ) : null}
    </div>
  );
}
