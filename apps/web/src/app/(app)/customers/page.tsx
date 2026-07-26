"use client";

import { useQuery } from "@tanstack/react-query";
import type { CustomerSummaryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useState } from "react";
import { useSession } from "../../../api/session-gate.tsx";
import { useTRPC } from "../../../api/providers.tsx";
import { useDebounced } from "../../../api/use-debounced.ts";
import { QueryStates } from "../../../ui/patterns/query-states.tsx";
import { SearchInput } from "../../../ui/primitives/search-input.tsx";
import { Badge } from "../../../ui/primitives/badge.tsx";
import { EmptyState } from "../../../ui/primitives/empty-state.tsx";
import { describeBalance } from "../../../ui/format.ts";

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
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  // 250 ms: long enough that a typed name is one request rather than fourteen,
  // short enough that the list feels like it is keeping up on a slow connection.
  const debounced = useDebounced(query, 250);

  const customers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: debounced,
      isActive: null,
      cursor: null,
      limit: 25,
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-heading font-bold">Khách hàng</h1>

      <SearchInput
        label="Tìm khách hàng"
        placeholder="Tên hoặc số điện thoại"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onClear={() => setQuery("")}
        autoFocus
      />

      <QueryStates
        query={customers}
        loadingLabel="Đang tìm khách hàng"
        onRetry={() => void customers.refetch()}
      >
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState
              title={query.length === 0 ? "Chưa có khách hàng nào" : "Không tìm thấy khách nào"}
              description={
                query.length === 0
                  ? "Thêm khách hàng đầu tiên để bắt đầu ghi đơn và công nợ."
                  : "Thử gõ ít chữ hơn, hoặc gõ số điện thoại."
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {page.items.map((customer) => (
                <li key={customer.id}>
                  <CustomerRow customer={customer} />
                </li>
              ))}
            </ul>
          )
        }
      </QueryStates>

      {customers.data?.nextCursor != null ? (
        // Deliberately not infinite scroll: a worker looking for one person wants
        // a better query, not more rows. Narrowing the search is faster than
        // paging, and this says so.
        <p className="text-caption text-ink-muted">
          Còn khách khác chưa hiện. Gõ thêm chữ để thu hẹp danh sách.
        </p>
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
