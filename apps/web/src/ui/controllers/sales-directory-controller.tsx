"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { SalesListView, type SalesListFilter } from "@/ui/screens/sales-list-view.tsx";

export function SalesDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<SalesListFilter>("all");
  const sales = useInfiniteQuery(
    trpc.sale.list.infiniteQueryOptions(
      {
        workspaceId,
        customerId: null,
        status:
          filter === "draft"
            ? "draft"
            : filter === "posted" || filter === "voided"
              ? "posted"
              : null,
        financialState: filter === "voided" ? "voided" : filter === "posted" ? "active" : null,
        from: null,
        to: null,
        limit: 25,
      },
      {
        initialCursor: null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  );
  const rows = useMemo(() => {
    const seen = new Set<string>();
    return (sales.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [sales.data?.pages]);
  const firstPage = sales.data?.pages[0];
  return (
    <SalesListView
      rows={rows}
      filter={filter}
      query={{ ...sales, data: firstPage }}
      canCreate={session.permissions.includes("sale.create")}
      hasMore={sales.hasNextPage === true}
      onFilterChange={(value) => {
        setFilter(value);
      }}
      onLoadMore={() => void sales.fetchNextPage()}
      onRetry={() => void sales.refetch()}
    />
  );
}
