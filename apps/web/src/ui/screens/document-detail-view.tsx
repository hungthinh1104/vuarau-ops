"use client";

import type { DocumentDto, DocumentShareResultDto, DocumentType } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatInstant } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { DocumentSnapshotView } from "@/ui/patterns/document/document-snapshot-view.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";

const DOCUMENT_TYPE_LABEL: Readonly<Record<DocumentType, string>> = {
  sale_receipt: "Phiếu bán hàng",
  customer_statement: "Sao kê khách hàng",
  purchase_order: "Đơn mua",
  delivery_note: "Phiếu giao hàng",
};

export function DocumentDetailView({
  query,
  onRetry,
  canShare,
  shareResult,
  onPrint,
  onShare,
  onRevoke,
  shareFeedback,
  revokeFeedback,
}: {
  readonly query: QueryLike<DocumentDto>;
  readonly onRetry: () => void;
  readonly canShare: boolean;
  readonly shareResult: DocumentShareResultDto | null;
  readonly onPrint: () => void;
  readonly onShare: (document: DocumentDto) => void;
  readonly onRevoke: () => void;
  readonly shareFeedback?: ReactNode;
  readonly revokeFeedback?: ReactNode;
}) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải chứng từ" onRetry={onRetry}>
      {(detail) => (
        <div className="flex flex-col gap-6">
          <PageHeader
            title={DOCUMENT_TYPE_LABEL[detail.documentType]}
            description={`Tạo ${formatInstant(detail.generatedAt)}`}
            back={{
              href: sourceHref(detail.sourceType, detail.sourceId),
              label: "Mở dữ liệu nguồn",
            }}
          />
          <DocumentSnapshotView document={detail} />
          <div className="flex flex-wrap gap-3 print:hidden">
            <Button tone="secondary" onClick={onPrint}>
              In chứng từ
            </Button>
            {canShare && shareResult === null ? (
              <Button onClick={() => onShare(detail)}>Tạo liên kết đọc trong 24 giờ</Button>
            ) : null}
          </div>
          {shareResult !== null ? (
            <section className="rounded-card border border-border bg-surface p-4">
              <p>Liên kết chỉ hiện một lần và hết hạn {formatInstant(shareResult.expiresAt)}:</p>
              <a
                className="break-all font-semibold text-info underline-offset-4 hover:underline"
                href={`/shared/documents/${shareResult.token}`}
                target="_blank"
                rel="noreferrer"
              >
                {`/shared/documents/${shareResult.token}`}
              </a>
              <Button tone="danger" onClick={onRevoke}>
                Thu hồi liên kết
              </Button>
            </section>
          ) : null}
          {shareFeedback}
          {revokeFeedback}
        </div>
      )}
    </QueryStates>
  );
}

function sourceHref(sourceType: string, sourceId: string): string {
  if (sourceType === "sale") return `/sales/${sourceId}`;
  if (sourceType === "customer") return `/customers/${sourceId}`;
  if (sourceType === "purchase") return `/purchases/${sourceId}`;
  return `/deliveries/${sourceId}`;
}
