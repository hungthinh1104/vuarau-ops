"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, CustomerSummaryDto, Page } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SearchInput } from "@/ui/primitives/search-input.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { EmptyState } from "@/ui/primitives/empty-state.tsx";
import { describeBalance } from "@/ui/format.ts";
import { LinkButton, PageActions, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { FilterChipGroup } from "@/ui/patterns/list/filter-chip-group.tsx";

/**
 * The first screen of every workflow: find the person.
 *
 * A depot worker knows the customer by name and market — "chị Lan chợ Bình Điền" —
 * so the search is one box over name and phone, and the folding that makes "co
 * hoa" find "Cô Hoà" happens in Postgres (`vuarau_fold`). Nothing is normalised
 * here: a client that stripped diacritics before sending would be a second,
 * different folding rule.
 *
 * Each row carries the balance, because "who is this and what do they owe" is one
 * question in a depot. Answering it in two round trips means the list and the
 * balance can disagree on screen.
 */
export default function CustomersPage() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<CustomerSummaryDto>[]>([]);
  // 250 ms: long enough that a typed name is one request rather than fourteen,
  // short enough that the list feels like it is keeping up on a slow connection.
  const debounced = useDebounced(query, 250);

  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: debounced,
      isActive: activeFilter,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    setCursor(null);
    setPages([]);
  }, [workspaceId, debounced, activeFilter]);
  useEffect(() => {
    if (!customers.data) return;
    setPages((current) => (cursor === null ? [customers.data] : [...current, customers.data]));
  }, [cursor, customers.data]);
  const items = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Khách hàng"
        actions={
          <PageActions>
            {session.permissions.includes("workspace.manage") ? (
              <LinkButton href="/workspace" secondary>
                Quản lý vựa
              </LinkButton>
            ) : null}
            {session.permissions.includes("customer.create") ? (
              <LinkButton href="/customers/new">Thêm khách hàng</LinkButton>
            ) : null}
          </PageActions>
        }
      />

      <div className="grid gap-3 rounded-card border border-border bg-surface-muted/60 p-3">
        <SearchInput
          label="Tìm khách hàng"
          placeholder="Tên hoặc số điện thoại"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onClear={() => setQuery("")}
          autoFocus
        />
        <FilterChipGroup
          label="Lọc trạng thái khách hàng"
          value={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
          options={[
            { value: "all", label: "Tất cả" },
            { value: "active", label: "Đang hoạt động" },
            { value: "inactive", label: "Đã ngưng" },
          ]}
          onChange={(value) => setActiveFilter(value === "all" ? null : value === "active")}
        />
      </div>

      <QueryStates
        query={customers}
        loadingLabel="Đang tìm khách hàng"
        onRetry={() => void customers.refetch()}
      >
        {() =>
          items.length === 0 ? (
            <EmptyState
              title={query.length === 0 ? "Chưa có khách hàng nào" : "Không tìm thấy khách nào"}
              description={
                query.length === 0
                  ? "Thêm khách hàng đầu tiên để bắt đầu ghi đơn và công nợ."
                  : "Thử gõ ít chữ hơn, hoặc gõ số điện thoại."
              }
            />
          ) : (
            <>
              <ul className="flex flex-col gap-2 lg:hidden">
                {items.map((customer) => (
                  <li key={customer.id}>
                    <CustomerRow customer={customer} />
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-card border border-border lg:block">
                <table className="w-full text-left text-body-sm">
                  <thead className="sticky top-16 z-10 bg-surface-muted text-label">
                    <tr>
                      <th className="px-3 py-2">Khách hàng</th>
                      <th className="px-3 py-2">Điện thoại</th>
                      <th className="px-3 py-2">Trạng thái</th>
                      <th className="px-3 py-2 text-right">Công nợ</th>
                      <th className="px-3 py-2">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((customer) => {
                      const balance = describeBalance(customer.balance, customer.classification);
                      return (
                        <tr key={customer.id} className="hover:bg-surface-muted">
                          <td className="px-3 py-2 font-medium">{customer.displayName}</td>
                          <td className="px-3 py-2">{customer.phone ?? "—"}</td>
                          <td className="px-3 py-2">
                            {customer.isActive ? "Đang hoạt động" : "Đã ngưng"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {balance.label} {balance.amount ?? "—"}
                          </td>
                          <td className="px-3 py-2">
                            <Link
                              href={`/customers/${customer.id}`}
                              className="text-info underline"
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
          )
        }
      </QueryStates>

      {nextCursor !== null ? (
        <div className="flex items-center gap-3">
          <p className="text-caption text-ink-muted">Đang hiện {items.length} khách hàng.</p>
          <button
            type="button"
            className="touch-target rounded-button border border-border px-3 text-label"
            disabled={customers.isFetching}
            onClick={() => setCursor(nextCursor)}
          >
            {customers.isFetching ? "Đang tải" : "Tải thêm"}
          </button>
          {customers.isError ? (
            <button
              type="button"
              className="text-info underline"
              onClick={() => customers.refetch()}
            >
              Thử lại
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function CustomerRow({ customer }: { customer: CustomerSummaryDto }) {
  const balance = describeBalance(customer.balance, customer.classification);

  return (
    <Link
      href={`/customers/${customer.id}`}
      className="flex min-h-[64px] items-center justify-between gap-3 rounded-card border border-border bg-surface px-4 py-3 hover:border-border-strong"
    >
      <span className="flex flex-col">
        <span className="text-body font-medium text-ink">{customer.displayName}</span>
        <span className="text-caption text-ink-muted">
          {customer.phone ?? "Không có số điện thoại"}
        </span>
      </span>

      <span className="flex items-center gap-2">
        {/* Still listed, still showing what they owe (BR-CUSTOMER-003). A list
            that hid these would make "dọn danh sách khách" a way to hide debt. */}
        {customer.isActive ? null : <Badge tone="neutral">Đã ngưng</Badge>}
        <span className="flex flex-col items-end">
          <span className="text-caption text-ink-muted">{balance.label}</span>
          <span className="tabular text-body font-semibold text-ink">{balance.amount ?? "—"}</span>
        </span>
      </span>
    </Link>
  );
}
