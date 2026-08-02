"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, SupplierDto } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useDebounced } from "@/api/use-debounced.ts";
import { SuppliersDirectoryView } from "@/ui/screens/suppliers-directory-view.tsx";

export function SuppliersDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<SupplierDto>[]>([]);
  const search = useQuery(
    trpc.supplier.search.queryOptions({
      workspaceId,
      query: useDebounced(query, 250),
      isActive: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!search.data) return;
    setPages((current) => (cursor === null ? [search.data!] : [...current, search.data!]));
  }, [cursor, search.data]);
  const suppliers = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  const reset = () => {
    setCursor(null);
    setPages([]);
  };
  return (
    <SuppliersDirectoryView
      queryText={query}
      onQueryChange={(value) => {
        setQuery(value);
        reset();
      }}
      onClearQuery={() => {
        setQuery("");
        reset();
      }}
      search={search}
      suppliers={suppliers}
      nextCursor={nextCursor}
      isFetching={search.isFetching}
      onRetry={() => void search.refetch()}
      onLoadMore={() => setCursor(nextCursor)}
      canCreate={session.permissions.includes("supplier.create")}
    />
  );
}
