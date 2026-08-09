"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  approveWorkspacePolicyCommandSchema,
  retireWorkspacePolicyCommandSchema,
  type WorkspacePolicyKind,
  workspacePolicyKindSchema,
} from "@vuarau/domain-contracts";
import { useCallback, useEffect, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { WorkspacePolicyView } from "@/ui/screens/workspace-policy-view.tsx";

export function WorkspacePolicyController() {
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const asOf = useState(() => new Date().toISOString())[0];
  const policies = useQuery(
    trpc.policy.list.queryOptions({
      workspaceId,
      policyKind: null,
      state: null,
      cursor: null,
      limit: 50,
    }),
  );
  const availability = useQuery(trpc.policy.availability.queryOptions({ workspaceId, asOf }));
  const approveMutation = useMutation(trpc.policy.approve.mutationOptions());
  const approveCommand = useContractCommand(
    approveWorkspacePolicyCommandSchema,
    approveMutation.mutateAsync,
  );
  const retireMutation = useMutation(trpc.policy.retire.mutationOptions());
  const retireCommand = useContractCommand(
    retireWorkspacePolicyCommandSchema,
    retireMutation.mutateAsync,
  );
  const refresh = useCallback(async () => {
    await Promise.all([policies.refetch(), availability.refetch()]);
  }, [availability.refetch, policies.refetch]);
  useEffect(() => {
    if (approveCommand.phase.kind === "succeeded" || retireCommand.phase.kind === "succeeded")
      void refresh();
  }, [approveCommand.phase.kind, refresh, retireCommand.phase.kind]);

  if (!session.permissions.includes("policy.read")) {
    return <WorkspacePolicyView permissionDenied />;
  }

  return (
    <WorkspacePolicyView
      policies={policies}
      availability={availability}
      canManage={session.permissions.includes("policy.manage")}
      approveCommand={approveCommand}
      retireCommand={retireCommand}
      onApprove={(payload) => void approveCommand.submit(payload)}
      onRetire={(payload) => void retireCommand.submit(payload)}
      onRetry={refresh}
    />
  );
}

export function isWorkspacePolicyKind(value: string): value is WorkspacePolicyKind {
  return workspacePolicyKindSchema.safeParse(value).success;
}
