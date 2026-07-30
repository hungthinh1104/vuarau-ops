"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DocumentId, DocumentShareId, DocumentShareResultDto } from "@vuarau/domain-contracts";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { formatInstant } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";

function sourceHref(sourceType: string, sourceId: string): string {
  if (sourceType === "sale") return `/sales/${sourceId}`;
  if (sourceType === "customer") return `/customers/${sourceId}`;
  if (sourceType === "purchase") return `/purchases/${sourceId}`;
  return `/deliveries/${sourceId}`;
}

export default function DocumentDetailPage() {
  const documentId = useParams<{ documentId: string }>().documentId as DocumentId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const document = useQuery(trpc.document.get.queryOptions({ workspaceId, documentId }));
  const shareMutation = useMutation(trpc.document.share.mutationOptions());
  const revokeMutation = useMutation(trpc.document.revokeShare.mutationOptions());
  const [shareId] = useState(() => crypto.randomUUID() as DocumentShareId);
  const share = useCommand<unknown, DocumentShareResultDto>((envelope) =>
    shareMutation.mutateAsync(envelope as never),
  );
  const revoke = useCommand<unknown, { shareId: string; revoked: true }>((envelope) =>
    revokeMutation.mutateAsync(envelope as never),
  );

  return (
    <QueryStates
      query={document}
      loadingLabel="Đang tải chứng từ"
      onRetry={() => void document.refetch()}
    >
      {(detail) => (
        <div className="flex max-w-4xl flex-col gap-5">
          <PageHeader
            title={`${detail.documentType.replaceAll("_", " ")} · phiên bản ${detail.version}`}
            description={`Tạo ${formatInstant(detail.generatedAt)} · mã kiểm tra ${detail.digest}`}
            back={{
              href: sourceHref(detail.sourceType, detail.sourceId),
              label: "Mở dữ liệu nguồn",
            }}
          />
          <section className="rounded-card border border-border bg-surface p-4 print:border-0">
            <pre className="whitespace-pre-wrap text-body-sm">
              {JSON.stringify(detail.snapshot, null, 2)}
            </pre>
          </section>
          <div className="flex flex-wrap gap-3 print:hidden">
            <Button tone="secondary" onClick={() => window.print()}>
              In chứng từ
            </Button>
            {session.permissions.includes("document.share") && share.result === null ? (
              <Button
                onClick={() =>
                  void share.submit({ shareId, documentId: detail.id, expiresAt: null })
                }
              >
                Tạo liên kết đọc
              </Button>
            ) : null}
          </div>
          {share.result !== null ? (
            <section className="rounded-card border border-border bg-surface p-4">
              <p>Liên kết chỉ hiện một lần:</p>
              <a
                className="break-all text-info underline"
                href={`/shared/documents/${share.result.token}`}
                target="_blank"
                rel="noreferrer"
              >
                {`/shared/documents/${share.result.token}`}
              </a>
              <Button
                tone="danger"
                onClick={() =>
                  void revoke.submit({
                    shareId: share.result!.shareId,
                    reason: "Thu hồi theo yêu cầu",
                  })
                }
              >
                Thu hồi liên kết
              </Button>
            </section>
          ) : null}
          <CommandOutcome
            command={share}
            attemptedAction="Tạo liên kết đọc"
            onReload={() => void document.refetch()}
          />
          <CommandOutcome
            command={revoke}
            attemptedAction="Thu hồi liên kết"
            onReload={() => void document.refetch()}
          />
        </div>
      )}
    </QueryStates>
  );
}
