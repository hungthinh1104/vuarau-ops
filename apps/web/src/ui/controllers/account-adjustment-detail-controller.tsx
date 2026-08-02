"use client";

import { useQuery } from "@tanstack/react-query";
import type { AccountAdjustmentGetInput } from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { AccountAdjustmentDetailView } from "@/ui/screens/account-adjustment-detail-view.tsx";

export function AccountAdjustmentDetailController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const adjustmentId = useParams<{ adjustmentId: string }>().adjustmentId;
  const detail = useQuery(
    trpc.account.adjustment.queryOptions({
      workspaceId,
      adjustmentId,
    } as AccountAdjustmentGetInput),
  );

  return <AccountAdjustmentDetailView query={detail} onRetry={() => void detail.refetch()} />;
}
