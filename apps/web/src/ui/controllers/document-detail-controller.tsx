"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createDocumentShareCommandSchema,
  revokeDocumentShareCommandSchema,
  type DocumentId,
  type DocumentShareId,
} from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useContractCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { DocumentDetailView } from "@/ui/screens/document-detail-view.tsx";

export function DocumentDetailController() {
  const documentId = useParams<{ documentId: string }>().documentId as DocumentId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const document = useQuery(trpc.document.get.queryOptions({ workspaceId, documentId }));
  const shareMutation = useMutation(trpc.document.share.mutationOptions());
  const revokeMutation = useMutation(trpc.document.revokeShare.mutationOptions());
  const [shareId] = useState(() => crypto.randomUUID() as DocumentShareId);
  const share = useContractCommand(createDocumentShareCommandSchema, shareMutation.mutateAsync);
  const revoke = useContractCommand(revokeDocumentShareCommandSchema, revokeMutation.mutateAsync);

  return (
    <DocumentDetailView
      query={document}
      onRetry={() => void document.refetch()}
      canShare={session.permissions.includes("document.share")}
      shareResult={share.result}
      onPrint={() => window.print()}
      onShare={(detail) => void share.submit({ shareId, documentId: detail.id, expiresAt: null })}
      onRevoke={() => {
        if (share.result === null) return;
        void revoke.submit({ shareId: share.result.shareId, reason: "Thu hồi theo yêu cầu" });
      }}
      shareFeedback={
        <CommandOutcome
          command={share}
          attemptedAction="Tạo liên kết đọc"
          onReload={() => void document.refetch()}
        />
      }
      revokeFeedback={
        <CommandOutcome
          command={revoke}
          attemptedAction="Thu hồi liên kết"
          onReload={() => void document.refetch()}
        />
      }
    />
  );
}
