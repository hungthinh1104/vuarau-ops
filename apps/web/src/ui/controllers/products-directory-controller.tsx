"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, ProductDto } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
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
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<ProductDto>[]>([]);
  const search = useQuery(
    trpc.product.search.queryOptions({
      workspaceId,
      query: useDebounced(query, 250),
      isActive: activeFilter,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!search.data) return;
    setPages((current) => (cursor === null ? [search.data!] : [...current, search.data!]));
    const fetchedAt = new Date().toISOString();
    void offline.cacheProducts(
      search.data.items.map((product) => ({
        ...offline.partition,
        productId: product.id,
        displayName: product.displayName,
        aliases: product.aliases,
        preferredUnit: product.preferredUnit,
        fetchedAt,
      })),
    );
  }, [cursor, offline, search.data]);
  const products = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const reset = () => {
    setCursor(null);
    setPages([]);
  };
  return (
    <ProductsDirectoryView
      queryText={query}
      onQueryChange={(value) => {
        setQuery(value);
        reset();
      }}
      onClearQuery={() => {
        setQuery("");
        reset();
      }}
      activeFilter={activeFilter}
      onFilterChange={(value) => {
        setActiveFilter(value);
        reset();
      }}
      search={search}
      products={products}
      nextCursor={nextCursor}
      isFetching={search.isFetching}
      onRetry={() => void search.refetch()}
      onLoadMore={() => setCursor(nextCursor)}
      canReadQuality={session.permissions.includes("quality.read")}
      canCreate={session.permissions.includes("product.create")}
    />
  );
}
