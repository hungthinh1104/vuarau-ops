"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { DeliveriesDirectoryView } from "@/ui/screens/deliveries-directory-view.tsx";

export function DeliveriesDirectoryController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query, 250);
  const deliveries = useInfiniteQuery(
    trpc.delivery.list.infiniteQueryOptions(
      {
        workspaceId,
        saleId: null,
        status: null,
        query: debouncedQuery,
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
    return (deliveries.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [deliveries.data?.pages]);
  const firstPage = deliveries.data?.pages[0];
  const lastPage = deliveries.data?.pages.at(-1);
  return (
    <DeliveriesDirectoryView
      query={{ ...deliveries, data: firstPage }}
      rows={rows}
      nextCursor={deliveries.hasNextPage ? (lastPage?.nextCursor ?? null) : null}
      isFetching={deliveries.isFetching}
      onRetry={() => void deliveries.refetch()}
      onLoadMore={() => void deliveries.fetchNextPage()}
      queryText={query}
      onQueryChange={setQuery}
      onClearQuery={() => setQuery("")}
    />
  );
}
