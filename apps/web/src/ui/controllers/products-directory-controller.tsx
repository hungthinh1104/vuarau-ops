"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { useOffline } from "@/offline/provider.tsx";
import { ProductsDirectoryView } from "@/ui/screens/products-directory-view.tsx";

export function ProductsDirectoryController() {
  const { workspaceId, session } = useSession();
  const offline = useOffline();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<boolean | null>(null);
  const search = useInfiniteQuery(
    trpc.product.search.infiniteQueryOptions(
      {
        workspaceId,
        query: useDebounced(query, 250),
        isActive: activeFilter,
        limit: 25,
      },
      {
        initialCursor: null,
        getNextPageParam: (page) => page.nextCursor ?? undefined,
      },
    ),
  );
  useEffect(() => {
    const pages = search.data?.pages ?? [];
    const fetchedAt = new Date().toISOString();
    void offline.cacheProducts(
      pages
        .flatMap((page) => page.items)
        .map((product) => ({
          ...offline.partition,
          productId: product.id,
          displayName: product.displayName,
          aliases: product.aliases,
          preferredUnit: product.preferredUnit,
          fetchedAt,
        })),
    );
  }, [offline, search.data?.pages]);
  const products = useMemo(() => {
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
    <ProductsDirectoryView
      queryText={query}
      onQueryChange={(value) => {
        setQuery(value);
      }}
      onClearQuery={() => {
        setQuery("");
      }}
      activeFilter={activeFilter}
      onFilterChange={(value) => {
        setActiveFilter(value);
      }}
      search={{ ...search, data: search.data?.pages[0] }}
      products={products}
      nextCursor={search.hasNextPage ? (search.data?.pages.at(-1)?.nextCursor ?? null) : null}
      isFetching={search.isFetching}
      onRetry={() => void search.refetch()}
      onLoadMore={() => void search.fetchNextPage()}
      canReadQuality={session.permissions.includes("quality.read")}
      canCreate={session.permissions.includes("product.create")}
    />
  );
}
