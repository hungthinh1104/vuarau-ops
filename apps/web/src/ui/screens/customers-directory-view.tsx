"use client";

import type { CustomerSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { describeBalance } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";
import { LoadMoreFooter } from "@/ui/patterns/list/load-more-footer.tsx";
import { PageActions, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";

export type CustomerStatusFilter = "all" | "active" | "inactive";

export type CustomersDirectoryViewProps = {
  readonly items: readonly CustomerSummaryDto[];
  readonly query: string;
  readonly activeFilter: CustomerStatusFilter;
  readonly queryState: QueryLike<unknown>;
  readonly isFetching: boolean;
  readonly isError: boolean;
  readonly hasMore: boolean;
  readonly canManageWorkspace: boolean;
  readonly canCreateCustomer: boolean;
  readonly onQueryChange: (query: string) => void;
  readonly onFilterChange: (filter: CustomerStatusFilter) => void;
  readonly onClearQuery: () => void;
  readonly onLoadMore: () => void;
  readonly onRetry: () => void;
};

export function CustomersDirectoryView(props: CustomersDirectoryViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6">
      <PageHeader
        title="Khách hàng"
        actions={
          <PageActions>
            {props.canManageWorkspace ? (
              <LinkButton href="/workspace" tone="secondary">
                Quản lý vựa
              </LinkButton>
            ) : null}
            {props.canCreateCustomer ? (
              <LinkButton href="/customers/new">Thêm khách hàng</LinkButton>
            ) : null}
          </PageActions>
        }
      />

      <div className="grid gap-3 border-y border-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <SearchInput
          label="Tìm khách hàng"
          placeholder="Tên hoặc số điện thoại"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onClear={props.onClearQuery}
          autoFocus
        />
        <FilterChipGroup
          label="Lọc trạng thái khách hàng"
          value={props.activeFilter}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "active", label: "Đang hoạt động" },
            { value: "inactive", label: "Đã ngưng" },
          ]}
          onChange={props.onFilterChange}
        />
      </div>

      <QueryStates
        query={props.queryState}
        loadingLabel="Đang tìm khách hàng"
        onRetry={props.onRetry}
      >
        {() =>
          props.items.length === 0 ? (
            <EmptyState
              title={
                props.query.length === 0 ? "Chưa có khách hàng nào" : "Không tìm thấy khách nào"
              }
              description={
                props.query.length === 0
                  ? "Thêm khách hàng đầu tiên để bắt đầu ghi đơn và công nợ."
                  : "Thử gõ ít chữ hơn, hoặc gõ số điện thoại."
              }
            />
          ) : (
            <CustomerRows items={props.items} />
          )
        }
      </QueryStates>

      {props.hasMore ? (
        <LoadMoreFooter
          visibleCount={props.items.length}
          noun="khách hàng"
          loading={props.isFetching}
          onLoadMore={props.onLoadMore}
          {...(props.isError ? { onRetry: props.onRetry } : {})}
        />
      ) : null}
    </div>
  );
}

function CustomerRows({ items }: { readonly items: readonly CustomerSummaryDto[] }) {
  return (
    <>
      <ul className="divide-border overflow-hidden rounded-card border border-border bg-surface divide-y lg:hidden">
        {items.map((customer) => (
          <li key={customer.id}>
            <CustomerRow customer={customer} />
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-card border border-border bg-surface shadow-sm lg:block">
        <table className="data-table min-w-[860px] text-left text-body-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="px-3 py-2">Khách hàng</th>
              <th className="px-3 py-2">Điện thoại</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2 text-right">Công nợ</th>
              <th className="px-3 py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {items.map((customer) => {
              const balance = describeBalance(customer.balance, customer.classification);
              return (
                <tr key={customer.id} className="transition-colors hover:bg-surface-muted">
                  <td className="px-3 py-2 font-medium">{customer.displayName}</td>
                  <td className="px-3 py-2">{customer.phone ?? "Chưa có số"}</td>
                  <td className="px-3 py-2">{customer.isActive ? "Đang hoạt động" : "Đã ngưng"}</td>
                  <td className="tabular px-3 py-2 text-right">
                    {balance.label} {balance.amount ?? "Chưa có số dư"}
                  </td>
                  <td className="px-3 py-2">
                    <Link
                      href={`/customers/${customer.id}`}
                      className="font-semibold text-info underline-offset-4 hover:underline"
                    >
                      Mở hồ sơ
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function CustomerRow({ customer }: { readonly customer: CustomerSummaryDto }) {
  const balance = describeBalance(customer.balance, customer.classification);
  return (
    <Link
      href={`/customers/${customer.id}`}
      className="flex min-h-[64px] items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
    >
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-body font-medium text-ink">{customer.displayName}</span>
        <span className="text-caption text-ink-muted">
          {customer.phone ?? "Không có số điện thoại"}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
        <span className="flex flex-col items-end">
          <span className="text-caption text-ink-muted">{balance.label}</span>
          <span className="tabular text-body font-semibold text-ink">
            {balance.amount ?? "Chưa có số dư"}
          </span>
        </span>
      </span>
    </Link>
  );
}
