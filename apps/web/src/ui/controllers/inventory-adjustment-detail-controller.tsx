"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { InventoryAdjustmentDetailView } from "@/ui/screens/inventory-adjustment-detail-view.tsx";

export function InventoryAdjustmentDetailController() {
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const detail = useQuery(trpc.inventory.getAdjustment.queryOptions({ workspaceId, adjustmentId }));

  return <InventoryAdjustmentDetailView query={detail} onRetry={() => void detail.refetch()} />;
}
