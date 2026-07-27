"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useDebounced } from "../../../../api/use-debounced.ts";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import { SearchInput } from "../../../../ui/primitives/search-input.tsx";
import { EmptyState } from "../../../../ui/primitives/empty-state.tsx";
import { describeBalance } from "../../../../ui/format.ts";

/** The direct entry door: select a person, then reuse the one sale command workflow. */
export default function FastSaleStartPage() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const debounced = useDebounced(query, 200);
  const recent = useQuery(trpc.customer.recent.queryOptions({ workspaceId, limit: 10 }));
  const search = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: debounced,
      isActive: true,
      cursor: null,
      limit: 12,
    }),
  );
  const showingRecent = query.trim().length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-heading font-bold">Ghi bông mới</h1>
        <p className="text-body-sm text-ink-muted">Chọn khách để bắt đầu ghi hàng.</p>
      </div>
      <SearchInput
        label="Tìm khách hàng"
        placeholder="Tên hoặc số điện thoại"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        autoFocus
      />
      {showingRecent ? (
        <QueryStates
          query={recent}
          loadingLabel="Đang tải khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={() => void recent.refetch()}
        >
          {(customers) =>
            customers.length === 0 ? (
              <EmptyState
                title="Chưa có khách gần đây"
                description="Tìm khách bằng tên hoặc số điện thoại để ghi bông."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {customers.map((customer) => {
                  const balance = describeBalance(customer.balance, customer.classification);
                  return (
                    <li key={customer.customerId}>
                      <Link
                        href={`/customers/${customer.customerId}/sales/new`}
                        className="flex min-h-[64px] items-center justify-between rounded-card border border-border bg-surface px-4 py-3 hover:border-border-strong"
                      >
                        <span>
                          <span className="block text-body font-medium">
                            {customer.displayName}
                          </span>
                          <span className="text-caption text-ink-muted">
                            {customer.phone ?? "Không có số điện thoại"}
                          </span>
                        </span>
                        <span className="text-right">
                          <span className="block text-caption text-ink-muted">{balance.label}</span>
                          <span className="tabular text-body font-semibold">
                            {balance.amount ?? "—"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )
          }
        </QueryStates>
      ) : (
        <QueryStates
          query={search}
          loadingLabel="Đang tìm khách hàng"
          attemptedAction="Chọn khách hàng"
          onRetry={() => void search.refetch()}
        >
          {(page) =>
            page.items.length === 0 ? (
              <EmptyState
                title="Không tìm thấy khách hàng"
                description="Thử gõ ít chữ hơn hoặc số điện thoại."
              />
            ) : (
              <ul className="flex flex-col gap-2">
                {page.items.map((customer) => (
                  <li key={customer.id}>
                    <Link
                      href={`/customers/${customer.id}/sales/new`}
                      className="flex min-h-[64px] items-center rounded-card border border-border bg-surface px-4 py-3 text-body font-medium hover:border-border-strong"
                    >
                      {customer.displayName}
                    </Link>
                  </li>
                ))}
              </ul>
            )
          }
        </QueryStates>
      )}
    </div>
  );
}
