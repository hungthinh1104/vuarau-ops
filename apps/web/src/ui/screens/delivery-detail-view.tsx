"use client";

import type { DeliveryDto } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { DELIVERY_STATUS_COPY } from "@/ui/copy.ts";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import {
  DetailLayout,
  PageFrame,
  PageHeader,
  SummaryRail,
} from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export type DeliveryDetailViewProps = {
  readonly query: QueryLike<DeliveryDto>;
  readonly canDispatch: boolean;
  readonly canComplete: boolean;
  readonly canReturn: boolean;
  readonly canGenerateDocument: boolean;
  readonly dispatchLocked: boolean;
  readonly completeLocked: boolean;
  readonly documentLocked: boolean;
  readonly feedback?: ReactNode;
  readonly renderReturnPanel?: (delivery: DeliveryDto) => ReactNode;
  readonly onDispatch: (delivery: DeliveryDto) => void;
  readonly onComplete: (delivery: DeliveryDto) => void;
  readonly onGenerateDocument: (delivery: DeliveryDto) => void;
  readonly onRetry: () => void;
};

export function DeliveryDetailView({
  query,
  canDispatch,
  canComplete,
  canReturn,
  canGenerateDocument,
  dispatchLocked,
  completeLocked,
  documentLocked,
  feedback,
  renderReturnPanel,
  onDispatch,
  onComplete,
  onGenerateDocument,
  onRetry,
}: DeliveryDetailViewProps) {
  return (
    <QueryStates query={query} loadingLabel="Đang tải phiếu giao" onRetry={onRetry}>
      {(delivery) => (
        <PageFrame size="standard">
          <DetailLayout
            aside={
              <SummaryRail title="Tóm tắt giao hàng">
                <dl className="grid gap-2 text-body-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Mặt hàng</dt>
                    <dd className="tabular font-semibold">{delivery.lines.length}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Trạng thái</dt>
                    <dd className="font-semibold">{DELIVERY_STATUS_COPY[delivery.status]}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-ink-muted">Lần trả hàng</dt>
                    <dd className="tabular font-semibold">{delivery.returns.length}</dd>
                  </div>
                </dl>
              </SummaryRail>
            }
          >
            <div className="flex flex-col gap-6">
              <PageHeader
                title="Phiếu giao"
                description={`${formatInstant(delivery.transactionTime)} · Mã ${delivery.id.slice(0, 8).toUpperCase()}`}
                back={{ href: `/sales/${delivery.saleId}`, label: "Mở đơn bán nguồn" }}
                status={
                  <Badge
                    tone={
                      delivery.status === "delivered"
                        ? "positive"
                        : delivery.status === "dispatched"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {DELIVERY_STATUS_COPY[delivery.status]}
                  </Badge>
                }
              />

              <section className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">Hàng giao</h2>
                    <p className="text-body-sm text-ink-muted">
                      Xuất kho làm giảm tồn kho. Xác nhận giao xong là bước riêng sau khi khách đã
                      nhận.
                    </p>
                  </div>
                  {delivery.returns.length > 0 ? (
                    <Badge tone="warning">{delivery.returns.length} lần trả hàng</Badge>
                  ) : null}
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {delivery.lines.map((line) => (
                    <li key={line.deliveryLineId} className="grid gap-2 py-3 md:grid-cols-4">
                      <Link
                        href={`/products/${line.productId}/inventory`}
                        className="font-semibold text-info underline-offset-4 hover:underline"
                      >
                        {line.productName}
                      </Link>
                      <span>{line.qualityGradeName ?? "Chưa phân loại (lịch sử)"}</span>
                      <span>Giao {formatQuantity(line.quantity)}</span>
                      <span>Trả {formatQuantity(line.returnedQuantity)}</span>
                    </li>
                  ))}
                </ul>
                <SourceEvidenceList references={delivery.evidenceReferences} className="mt-3" />
                {delivery.returns.map((record) => (
                  <SourceEvidenceList
                    key={record.id}
                    references={record.evidenceReferences}
                    className="mt-3"
                  />
                ))}
              </section>

              {delivery.status === "draft" && canDispatch ? (
                <ActionDock
                  label="Hành động giao hàng"
                  summary={
                    <div>
                      <p className="text-caption font-semibold text-ink-muted">Trạng thái</p>
                      <p className="text-body-sm font-semibold text-ink">Sẵn sàng xuất kho</p>
                    </div>
                  }
                  primary={
                    <Button disabled={dispatchLocked} onClick={() => onDispatch(delivery)}>
                      {dispatchLocked ? "Đang xuất kho…" : "Xuất kho & bắt đầu giao"}
                    </Button>
                  }
                  secondary={
                    canGenerateDocument ? (
                      <Button
                        tone="secondary"
                        disabled={documentLocked}
                        onClick={() => onGenerateDocument(delivery)}
                      >
                        {documentLocked ? "Đang tạo chứng từ" : "Tạo chứng từ giao hàng"}
                      </Button>
                    ) : null
                  }
                  feedback={feedback}
                />
              ) : delivery.status === "dispatched" && canComplete ? (
                <ActionDock
                  label="Hành động giao hàng"
                  summary={
                    <div>
                      <p className="text-caption font-semibold text-ink-muted">Trạng thái</p>
                      <p className="text-body-sm font-semibold text-ink">Đang giao</p>
                    </div>
                  }
                  primary={
                    <Button disabled={completeLocked} onClick={() => onComplete(delivery)}>
                      {completeLocked ? "Đang xác nhận…" : "Xác nhận giao xong"}
                    </Button>
                  }
                  secondary={
                    canGenerateDocument ? (
                      <Button
                        tone="secondary"
                        disabled={documentLocked}
                        onClick={() => onGenerateDocument(delivery)}
                      >
                        {documentLocked ? "Đang tạo chứng từ" : "Tạo chứng từ giao hàng"}
                      </Button>
                    ) : null
                  }
                  feedback={feedback}
                />
              ) : canGenerateDocument ? (
                <ActionDock
                  label="Hành động giao hàng"
                  summary={<p className="text-body-sm font-semibold text-ink">Đơn đã giao</p>}
                  primary={
                    <Button
                      tone="secondary"
                      disabled={documentLocked}
                      onClick={() => onGenerateDocument(delivery)}
                    >
                      {documentLocked ? "Đang tạo chứng từ" : "Tạo chứng từ giao hàng"}
                    </Button>
                  }
                  feedback={feedback}
                />
              ) : (
                feedback
              )}

              {["dispatched", "delivered"].includes(delivery.status) && canReturn
                ? renderReturnPanel?.(delivery)
                : null}
            </div>
          </DetailLayout>
        </PageFrame>
      )}
    </QueryStates>
  );
}
