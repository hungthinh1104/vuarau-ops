"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { PurchasesDirectoryView } from "@/ui/screens/purchases-directory-view.tsx";

export function PurchasesDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const purchases = useInfiniteQuery(
    trpc.purchase.list.infiniteQueryOptions(
      {
        workspaceId,
        supplierId: null,
        status: null,
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
    return (purchases.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((row) => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      });
  }, [purchases.data?.pages]);
  const firstPage = purchases.data?.pages[0];
  const lastPage = purchases.data?.pages.at(-1);
  return (
    <PurchasesDirectoryView
      query={{ ...purchases, data: firstPage }}
      rows={rows}
      nextCursor={purchases.hasNextPage ? (lastPage?.nextCursor ?? null) : null}
      isFetching={purchases.isFetching}
      onRetry={() => void purchases.refetch()}
      onLoadMore={() => void purchases.fetchNextPage()}
      canCreate={session.permissions.includes("purchase.create")}
    />
  );
}
