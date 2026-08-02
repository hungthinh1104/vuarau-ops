"use client";

import { useQuery } from "@tanstack/react-query";
import type { DeliveryDto } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { pageStateForWorkspace, type WorkspacePageState } from "@/api/workspace-page-state.ts";
import { DeliveriesDirectoryView } from "@/ui/screens/deliveries-directory-view.tsx";

export function DeliveriesDirectoryController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const [pageState, setPageState] = useState<WorkspacePageState<DeliveryDto>>({
    workspaceId,
    cursor: null,
    pages: [],
  });
  const visible = pageStateForWorkspace(pageState, workspaceId);
  const deliveries = useQuery(
    trpc.delivery.list.queryOptions({
      workspaceId,
      saleId: null,
      status: null,
      cursor: visible.cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!deliveries.data) return;
    setPageState((current) => {
      const scoped = pageStateForWorkspace(current, workspaceId);
      return {
        workspaceId,
        cursor: scoped.cursor,
        pages: scoped.cursor === null ? [deliveries.data!] : [...scoped.pages, deliveries.data!],
      };
    });
  }, [deliveries.data, workspaceId]);
  const rows = visible.pages.flatMap((page) => page.items);
  const nextCursor = visible.pages.at(-1)?.nextCursor ?? null;
  return (
    <DeliveriesDirectoryView
      query={deliveries}
      rows={rows}
      nextCursor={nextCursor}
      isFetching={deliveries.isFetching}
      onRetry={() => void deliveries.refetch()}
      onLoadMore={() => setPageState({ ...visible, cursor: nextCursor })}
    />
  );
}
