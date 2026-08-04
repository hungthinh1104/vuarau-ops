"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { SuppliersDirectoryView } from "@/ui/screens/suppliers-directory-view.tsx";

export function SuppliersDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const search = useInfiniteQuery(
    trpc.supplier.search.infiniteQueryOptions(
      {
        workspaceId,
        query: useDebounced(query, 250),
        isActive: null,
        limit: 25,
      },
      {
        initialCursor: null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  );
  const suppliers = useMemo(() => {
    const seen = new Set<string>();
    return (search.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [search.data?.pages]);
  return (
    <SuppliersDirectoryView
      queryText={query}
      onQueryChange={(value) => {
        setQuery(value);
      }}
      onClearQuery={() => {
        setQuery("");
      }}
      search={{ ...search, data: search.data?.pages[0] }}
      suppliers={suppliers}
      nextCursor={search.hasNextPage ? (search.data?.pages.at(-1)?.nextCursor ?? null) : null}
      isFetching={search.isFetching}
      onRetry={() => void search.refetch()}
      onLoadMore={() => void search.fetchNextPage()}
      canCreate={session.permissions.includes("supplier.create")}
    />
  );
}
