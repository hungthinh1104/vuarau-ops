"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  OPERATIONS_BOARD_FILTERS,
  OPERATIONS_BOARD_SORTS,
  type OperationsBoardFilter,
  type OperationsBoardRow,
  type OperationsBoardSort,
} from "@vuarau/domain-contracts";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { OperationsBoardView } from "@/ui/screens/operations-board-view.tsx";

function filterOf(value: string | null): OperationsBoardFilter {
  return OPERATIONS_BOARD_FILTERS.includes(value as OperationsBoardFilter)
    ? (value as OperationsBoardFilter)
    : "all";
}

function sortOf(value: string | null): OperationsBoardSort {
  return OPERATIONS_BOARD_SORTS.includes(value as OperationsBoardSort)
    ? (value as OperationsBoardSort)
    : "updated_desc";
}

export function OperationsBoardController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [filter, setFilter] = useState<OperationsBoardFilter>(() => filterOf(params.get("filter")));
  const [sort, setSort] = useState<OperationsBoardSort>(() => sortOf(params.get("sort")));
  const [search, setSearch] = useState(() => params.get("q") ?? "");

  const updateUrl = (next: {
    filter?: OperationsBoardFilter;
    sort?: OperationsBoardSort;
    search?: string;
  }) => {
    const nextParams = new URLSearchParams(params.toString());
    const nextFilter = next.filter ?? filter;
    const nextSort = next.sort ?? sort;
    const nextSearch = next.search ?? search;
    if (nextFilter === "all") nextParams.delete("filter");
    else nextParams.set("filter", nextFilter);
    if (nextSort === "updated_desc") nextParams.delete("sort");
    else nextParams.set("sort", nextSort);
    if (nextSearch.trim() === "") nextParams.delete("q");
    else nextParams.set("q", nextSearch.trim());
    const query = nextParams.toString();
    router.replace(query === "" ? pathname : `${pathname}?${query}`, { scroll: false });
  };

  useEffect(() => {
    const urlFilter = filterOf(params.get("filter"));
    const urlSort = sortOf(params.get("sort"));
    const urlSearch = params.get("q") ?? "";
    if (urlFilter !== filter) setFilter(urlFilter);
    if (urlSort !== sort) setSort(urlSort);
    if (urlSearch !== search) setSearch(urlSearch);
  }, [filter, params, search, sort]);

  const input = useMemo(
    () => ({ workspaceId, filter, sort, search, limit: 25 }),
    [filter, search, sort, workspaceId],
  );
  const board = useInfiniteQuery(
    trpc.dashboard.operationsBoard.infiniteQueryOptions(input, {
      initialCursor: null,
      getNextPageParam: (lastPage) => lastPage.page.nextCursor ?? undefined,
    }),
  );
  const counts = useQuery(
    trpc.dashboard.operationsBoardCounts.queryOptions({ workspaceId, filter, search }),
  );
  const rows = useMemo(() => {
    const seen = new Set<string>();
    const result: OperationsBoardRow[] = [];
    for (const page of board.data?.pages ?? []) {
      for (const row of page.page.items) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        result.push(row);
      }
    }
    return result;
  }, [board.data?.pages]);
  const firstPage = board.data?.pages[0];

  return (
    <OperationsBoardView
      query={{
        ...board,
        data:
          firstPage === undefined
            ? undefined
            : {
                counts: counts.data?.counts ?? firstPage.counts,
                page: {
                  items: rows,
                  nextCursor: board.data?.pages.at(-1)?.page.nextCursor ?? null,
                },
              },
      }}
      rows={rows}
      filter={filter}
      sort={sort}
      search={search}
      onFilterChange={(value) => {
        setFilter(value);
        updateUrl({ filter: value });
      }}
      onSortChange={(value) => {
        setSort(value);
        updateUrl({ sort: value });
      }}
      onSearchChange={(value) => {
        setSearch(value);
        updateUrl({ search: value });
      }}
      onRetry={() => void board.refetch()}
      onLoadMore={() => void board.fetchNextPage()}
    />
  );
}
