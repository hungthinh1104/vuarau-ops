"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  rebuildAccountProjectionCommandSchema,
  type AccountReconciliationEvidenceDto,
  type CustomerId,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { AccountReconciliationView } from "@/ui/screens/account-reconciliation-view.tsx";

export function AccountReconciliationController() {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const customerId = useParams<{ customerId: string }>().customerId as CustomerId;
  const [reason, setReason] = useState("Dựng lại bảng tổng hợp sau đối soát");
  const reconciliation = useQuery(
    trpc.account.reconciliation.queryOptions({ workspaceId, customerId }),
  );
  const evidence = useQuery({
    ...trpc.account.reconciliationEvidence.queryOptions({ workspaceId, customerId }),
    enabled: false,
  });
  const rebuildMutation = useMutation(trpc.account.rebuildProjection.mutationOptions());
  const rebuild = useContractCommand(
    rebuildAccountProjectionCommandSchema,
    rebuildMutation.mutateAsync,
  );

  return (
    <AccountReconciliationView
      customerId={customerId}
      query={reconciliation}
      evidence={evidence.data as AccountReconciliationEvidenceDto | undefined}
      evidenceFetching={evidence.isFetching}
      rebuild={rebuild}
      reason={reason}
      onReasonChange={setReason}
      onRebuild={() => void rebuild.submit({ customerId, reason })}
      onRetry={() => void reconciliation.refetch()}
      onEvidence={() => void evidence.refetch()}
    />
  );
}
