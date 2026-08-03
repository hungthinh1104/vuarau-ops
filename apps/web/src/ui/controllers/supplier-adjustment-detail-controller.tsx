"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { SupplierAdjustmentDetailView } from "@/ui/screens/supplier-adjustment-detail-view.tsx";

export function SupplierAdjustmentDetailController() {
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const detail = useQuery(trpc.supplier.getAdjustment.queryOptions({ workspaceId, adjustmentId }));

  return <SupplierAdjustmentDetailView query={detail} onRetry={() => void detail.refetch()} />;
}
