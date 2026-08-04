"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { CustomersDirectoryView } from "@/ui/screens/customers-directory-view.tsx";

export function CustomersDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const debounced = useDebounced(query, 250);
  const customers = useInfiniteQuery(
    trpc.customer.search.infiniteQueryOptions(
      {
        workspaceId,
        query: debounced,
        isActive: activeFilter,
        limit: 25,
      },
      {
        initialCursor: null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  );
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (customers.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [customers.data?.pages]);
  return (
    <CustomersDirectoryView
      items={items}
      query={query}
      activeFilter={activeFilter === null ? "all" : activeFilter ? "active" : "inactive"}
      queryState={{ ...customers, data: customers.data?.pages[0] }}
      isFetching={customers.isFetching}
      isError={customers.isError}
      hasMore={customers.hasNextPage === true}
      canManageWorkspace={session.permissions.includes("workspace.manage")}
      canCreateCustomer={session.permissions.includes("customer.create")}
      onQueryChange={setQuery}
      onFilterChange={(filter) => setActiveFilter(filter === "all" ? null : filter === "active")}
      onClearQuery={() => setQuery("")}
      onLoadMore={() => {
        void customers.fetchNextPage();
      }}
      onRetry={() => void customers.refetch()}
    />
  );
}
