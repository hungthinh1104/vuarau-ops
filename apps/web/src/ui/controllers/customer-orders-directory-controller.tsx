"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, CustomerOrderSummaryDto, Page } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { CustomerOrdersDirectoryView } from "@/ui/screens/customer-orders-directory-view.tsx";

export function CustomerOrdersDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<CustomerOrderSummaryDto>[]>([]);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const orders = useQuery(
    trpc.customerOrder.list.queryOptions({
      workspaceId,
      customerId: null,
      status: null,
      query: debouncedQuery,
      cursor,
      limit: 25,
    }),
  );

  useEffect(() => {
    if (!orders.data) return;
    setPages((current) => (cursor === null ? [orders.data] : [...current, orders.data]));
  }, [cursor, orders.data]);

  const rows = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const changeQuery = (value: string) => {
    setQuery(value);
    setCursor(null);
    setPages([]);
  };
  return (
    <CustomerOrdersDirectoryView
      query={orders}
      rows={rows}
      nextCursor={nextCursor}
      isFetching={orders.isFetching}
      canCreate={session.permissions.includes("customer_order.create")}
      onRetry={() => void orders.refetch()}
      onLoadMore={() => {
        if (nextCursor !== null) setCursor(nextCursor);
      }}
      queryText={query}
      onQueryChange={changeQuery}
      onClearQuery={() => changeQuery("")}
    />
  );
}
