"use client";

import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { IntakeListView } from "@/ui/screens/intake-list-view.tsx";

export function IntakeListController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const arrivals = useQuery(
    trpc.intake.listArrivals.queryOptions({
      workspaceId,
      supplierId: null,
      purchaseId: null,
      cursor: null,
      limit: 100,
    }),
  );

  return (
    <IntakeListView
      query={arrivals}
      canRead={session.permissions.includes("intake.read")}
      role={session.role}
      roles={session.roles}
      onRetry={() => void arrivals.refetch()}
    />
  );
}
