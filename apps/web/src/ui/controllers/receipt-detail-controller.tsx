"use client";

import { useQuery } from "@tanstack/react-query";
import type { PurchaseReceiptId } from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { ReceiptDetailView } from "@/ui/screens/receipt-detail-view.tsx";

export function ReceiptDetailController() {
  const receiptId = useParams<{ receiptId: string }>().receiptId as PurchaseReceiptId;
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const receipt = useQuery(trpc.receiving.get.queryOptions({ workspaceId, receiptId }));
  return <ReceiptDetailView query={receipt} onRetry={() => void receipt.refetch()} />;
}
