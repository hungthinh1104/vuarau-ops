"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, CustomerSummaryDto, Page } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { CustomersDirectoryView } from "@/ui/screens/customers-directory-view.tsx";

export function CustomersDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<CustomerSummaryDto>[]>([]);
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
    setPages((current) => (cursor === null ? [customers.data!] : [...current, customers.data!]));
  }, [cursor, customers.data]);
  const items = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  return (
    <CustomersDirectoryView
      items={items}
      query={query}
      activeFilter={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
      queryState={customers}
      isFetching={customers.isFetching}
      isError={customers.isError}
      hasMore={nextCursor !== null}
      canManageWorkspace={session.permissions.includes("workspace.manage")}
      canCreateCustomer={session.permissions.includes("customer.create")}
      onQueryChange={setQuery}
      onFilterChange={(filter) => setActiveFilter(filter === "all" ? null : filter === "active")}
      onClearQuery={() => setQuery("")}
      onLoadMore={() => {
        if (nextCursor !== null) setCursor(nextCursor);
      }}
      onRetry={() => void customers.refetch()}
    />
  );
}
