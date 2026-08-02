"use client";

import { useQuery } from "@tanstack/react-query";
import type { SaleSummaryDto } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { pageStateForWorkspace, type WorkspacePageState } from "@/api/workspace-page-state.ts";
import { SalesListView, type SalesListFilter } from "@/ui/screens/sales-list-view.tsx";

export function SalesDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [filter, setFilter] = useState<SalesListFilter>("all");
  const [pageState, setPageState] = useState<WorkspacePageState<SaleSummaryDto>>({
    workspaceId,
    cursor: null,
    pages: [],
  });
  const visible = pageStateForWorkspace(pageState, workspaceId);
  const sales = useQuery(
    trpc.sale.list.queryOptions({
      workspaceId,
      customerId: null,
      status:
        filter === "draft" ? "draft" : filter === "posted" || filter === "voided" ? "posted" : null,
      financialState: filter === "voided" ? "voided" : filter === "posted" ? "active" : null,
      from: null,
      to: null,
      cursor: visible.cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!sales.data) return;
    setPageState((current) => {
      const scoped = pageStateForWorkspace(current, workspaceId);
      return {
        workspaceId,
        cursor: scoped.cursor,
        pages: scoped.cursor === null ? [sales.data!] : [...scoped.pages, sales.data!],
      };
    });
  }, [sales.data, workspaceId]);
  const rows = visible.pages.flatMap((page) => page.items);
  const next = visible.pages.at(-1)?.nextCursor ?? null;
  return (
    <SalesListView
      rows={rows}
      filter={filter}
      query={sales}
      canCreate={session.permissions.includes("sale.create")}
      hasMore={next !== null}
      onFilterChange={(value) => {
        setFilter(value);
        setPageState({ workspaceId, cursor: null, pages: [] });
      }}
      onLoadMore={() => {
        if (next !== null) setPageState({ ...visible, cursor: next });
      }}
      onRetry={() => void sales.refetch()}
    />
  );
}
