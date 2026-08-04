"use client";

import type { SaleSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { formatInstant, formatMoney } from "@/ui/format.ts";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { PageActions, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";

export type SalesListFilter = "all" | "draft" | "posted" | "voided";

export type SalesListViewProps = {
  readonly rows: readonly SaleSummaryDto[];
  readonly filter: SalesListFilter;
  readonly query: QueryLike<unknown> & { readonly isFetching: boolean };
  readonly canCreate: boolean;
  readonly hasMore: boolean;
  readonly onFilterChange: (filter: SalesListFilter) => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
};

export function SalesListView({
  rows,
  filter,
  query,
  canCreate,
  hasMore,
  onFilterChange,
  onLoadMore,
  onRetry,
}: SalesListViewProps) {
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Đơn hàng"
        description="Các đơn đã ghi trong vựa, gồm đơn nháp, đã chốt và đã hoàn tác."
        actions={
          canCreate ? (
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
          onChange={onFilterChange}
        />
      </div>

      <QueryStates query={query} loadingLabel="Đang tải đơn hàng" onRetry={onRetry}>
        {() =>
          rows.length === 0 ? (
            <EmptyState
              title="Chưa có đơn hàng"
              description="Ghi đơn đầu tiên để bắt đầu theo dõi bán hàng và công nợ."
            />
          ) : (
            <SalesRows rows={rows} />
          )
        }
      </QueryStates>

      {hasMore ? (
        <LoadMoreFooter
          visibleCount={rows.length}
          noun="đơn hàng"
          loading={query.isFetching}
          onLoadMore={onLoadMore}
        />
      ) : null}
    </div>
  );
}

function SalesRows({ rows }: { readonly rows: readonly SaleSummaryDto[] }) {
  return (
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

      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface shadow-sm lg:block">
        <table className="data-table w-full min-w-[900px] text-left text-body-sm">
          <colgroup>
            <col className="w-[18%]" />
            <col className="w-[25%]" />
            <col className="w-[10%]" />
            <col className="w-[15%]" />
            <col className="w-[12%]" />
            <col className="w-[12%]" />
            <col className="w-[8%]" />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">Thời điểm</th>
              <th className="px-3 py-2">Khách hàng</th>
              <th className="px-3 py-2">Số dòng</th>
              <th className="px-3 py-2 text-right">Tổng đơn</th>
              <th className="px-3 py-2">Công nợ</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right">Thao tác</th>
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
                <td className="px-3 py-2 text-right">
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
  );
}
