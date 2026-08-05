"use client";

import type {
  ArrivalLineHistoryDto,
  QualityDispositionDto,
  QualityInspectionDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { UI_COPY_REGISTRY } from "@/ui/copy.ts";
import { formatQuantity } from "@/ui/format.ts";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

export type FactHistoryProps = {
  readonly facts: ArrivalLineHistoryDto;
  readonly canInspectReverse: boolean;
  readonly canDispositionReverse: boolean;
  readonly onChanged: () => void;
  readonly renderInspectionReverse?: (inspection: QualityInspectionDto) => ReactNode;
  readonly renderDispositionReverse?: (disposition: QualityDispositionDto) => ReactNode;
};

export function FactHistory({
  facts,
  canInspectReverse,
  canDispositionReverse,
  renderInspectionReverse,
  renderDispositionReverse,
}: FactHistoryProps) {
  if (facts.inspections.length === 0 && facts.dispositions.length === 0) {
    return (
      <section className="rounded-card bg-canvas p-3 text-body-sm text-ink-muted">
        Chưa có lần kiểm hàng hoặc kết quả xử lý.
      </section>
    );
  }
  return (
    <details className="rounded-card border border-border p-3">
      <summary className="cursor-pointer text-label font-semibold">
        Lịch sử kiểm hàng và xử lý ({facts.inspections.length + facts.dispositions.length})
      </summary>
      <div className="mt-3 grid gap-3">
        {facts.inspections.map((inspection) => (
          <article key={inspection.id} className="rounded-card bg-canvas p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-label font-semibold">
                  Kiểm hàng {formatQuantity(inspection.inspectedQuantity)}
                </p>
                <p className="text-caption text-ink-muted">
                  {new Date(inspection.transactionTime).toLocaleString("vi-VN")}
                </p>
              </div>
              <Badge tone={inspection.reversal === null ? "positive" : "neutral"}>
                {inspection.reversal === null ? "Hiệu lực" : "Đã hoàn tác"}
              </Badge>
            </div>
            {inspection.issues.length > 0 ? (
              <ul className="mt-2 grid gap-1 text-body-sm">
                {inspection.issues.map((issue) => (
                  <li key={`${inspection.id}:${issue.qualityIssueCodeId}`}>
                    {issue.qualityIssueName} · {UI_COPY_REGISTRY.severity[issue.severity]}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-body-sm text-ink-muted">Không ghi nhận vấn đề.</p>
            )}
            {inspection.note ? (
              <p className="mt-2 text-caption text-ink-muted">
                Ghi chú kiểm hàng: {inspection.note}
              </p>
            ) : null}
            <SourceEvidenceList
              references={inspection.evidenceReferences}
              className="mt-3 border-t border-border pt-2"
            />
            {canInspectReverse && inspection.reversal === null
              ? renderInspectionReverse?.(inspection)
              : null}
          </article>
        ))}
        {facts.dispositions.map((disposition) => (
          <article key={disposition.id} className="rounded-card bg-canvas p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-label font-semibold">
                  Kết quả từ{" "}
                  {disposition.source.type === "arrival_line" ? "hàng đã nhận" : "lượng tạm giữ"}
                </p>
                <p className="text-caption text-ink-muted">
                  {new Date(disposition.transactionTime).toLocaleString("vi-VN")}
                </p>
              </div>
              <Badge tone={disposition.reversal === null ? "positive" : "neutral"}>
                {disposition.reversal === null ? "Hiệu lực" : "Đã hoàn tác"}
              </Badge>
            </div>
            <ul className="mt-2 grid gap-1 text-body-sm">
              {disposition.allocations.map((allocation) => (
                <li key={allocation.allocationId}>
                  {outcomeLabel(allocation.outcome)} · {formatQuantity(allocation.quantity)}
                  {allocation.qualityGradeName ? ` · ${allocation.qualityGradeName}` : ""}
                </li>
              ))}
            </ul>
            <SourceEvidenceList
              references={disposition.evidenceReferences}
              className="mt-3 border-t border-border pt-2"
            />
            {canDispositionReverse && disposition.reversal === null
              ? renderDispositionReverse?.(disposition)
              : null}
          </article>
        ))}
      </div>
    </details>
  );
}

const outcomeLabel = (outcome: QualityDispositionDto["allocations"][number]["outcome"]) =>
  ({
    accepted: UI_COPY_REGISTRY.qualityOutcome.accepted,
    quarantined: UI_COPY_REGISTRY.qualityOutcome.quarantined,
    rejected: UI_COPY_REGISTRY.qualityOutcome.rejected,
    disposed: UI_COPY_REGISTRY.qualityOutcome.disposed,
  })[outcome];

export function ReverseInspectionControl({
  reason,
  locked,
  feedback,
  onReasonChange,
  onSubmit,
}: {
  readonly reason: string;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <details className="mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer text-caption font-semibold text-danger">
        Hoàn tác kiểm hàng
      </summary>
      <div className="mt-2 grid gap-2">
        <Input
          value={reason}
          placeholder="Lý do hoàn tác"
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <Button tone="danger" disabled={locked || reason.trim().length === 0} onClick={onSubmit}>
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác kiểm hàng"}
        </Button>
        {feedback}
      </div>
    </details>
  );
}

export function ReverseDispositionControl({
  reason,
  locked,
  feedback,
  onReasonChange,
  onSubmit,
}: {
  readonly reason: string;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <details className="mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer text-caption font-semibold text-danger">
        Hoàn tác quyết định
      </summary>
      <div className="mt-2 grid gap-2">
        <Input
          value={reason}
          placeholder="Hoàn tác fact con trước fact cha"
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <Button tone="danger" disabled={locked || reason.trim().length === 0} onClick={onSubmit}>
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác quyết định"}
        </Button>
        {feedback}
      </div>
    </details>
  );
}
