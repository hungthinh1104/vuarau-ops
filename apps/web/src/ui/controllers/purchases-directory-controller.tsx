"use client";

import { useQuery } from "@tanstack/react-query";
import type { Cursor, Page, PurchaseDto } from "@vuarau/domain-contracts";
import { useEffect, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { PurchasesDirectoryView } from "@/ui/screens/purchases-directory-view.tsx";

export function PurchasesDirectoryController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<PurchaseDto>[]>([]);
  const purchases = useQuery(
    trpc.purchase.list.queryOptions({
      workspaceId,
      supplierId: null,
      status: null,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (!purchases.data) return;
    setPages((current) => (cursor === null ? [purchases.data!] : [...current, purchases.data!]));
  }, [cursor, purchases.data]);
  const rows = pages.flatMap((page) => page.items);
  const nextCursor = pages.at(-1)?.nextCursor ?? null;
  return (
    <PurchasesDirectoryView
      query={purchases}
      rows={rows}
      nextCursor={nextCursor}
      isFetching={purchases.isFetching}
      onRetry={() => void purchases.refetch()}
      onLoadMore={() => setCursor(nextCursor)}
      canCreate={session.permissions.includes("purchase.create")}
    />
  );
}
