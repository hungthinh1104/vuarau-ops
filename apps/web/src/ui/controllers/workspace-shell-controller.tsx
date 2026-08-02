"use client";

import { useOffline } from "@/offline/provider.tsx";
import { WorkspaceShell, type WorkspaceShellProps } from "@/ui/patterns/layout/workspace-shell.tsx";

export function ConnectedWorkspaceShell(props: Omit<WorkspaceShellProps, "sync">) {
  const offline = useOffline();
  return (
    <WorkspaceShell
      {...props}
      sync={{
        queuedCount: offline.queuedCount,
        blockedCount: offline.blockedCount,
        lastSuccessfulSync: offline.lastSuccessfulSync,
        onRetry: offline.retry,
      }}
    />
  );
}
