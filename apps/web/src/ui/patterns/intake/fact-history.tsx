"use client";

import type {
  ArrivalLineHistoryDto,
  QualityDispositionDto,
  QualityInspectionDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatQuantity } from "@/ui/format.ts";
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
        Chưa có kiểm định hoặc quyết định chất lượng.
      </section>
    );
  }
  return (
    <details className="rounded-card border border-border p-3">
      <summary className="cursor-pointer text-label font-semibold">
        Lịch sử kiểm định và quyết định ({facts.inspections.length + facts.dispositions.length})
      </summary>
      <div className="mt-3 grid gap-3">
        {facts.inspections.map((inspection) => (
          <article key={inspection.id} className="rounded-card bg-canvas p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-label font-semibold">
                  Kiểm định {formatQuantity(inspection.inspectedQuantity)}
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
                    {issue.qualityIssueCode} · {issue.qualityIssueName} · {issue.severity}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-body-sm text-ink-muted">Không ghi nhận vấn đề.</p>
            )}
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
                  Quyết định từ{" "}
                  {disposition.source.type === "arrival_line" ? "hàng đến" : "lượng cách ly"}
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
    accepted: "Chấp nhận",
    quarantined: "Cách ly",
    rejected: "Từ chối",
    disposed: "Hủy bỏ",
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
        Hoàn tác kiểm định
      </summary>
      <div className="mt-2 grid gap-2">
        <Input
          value={reason}
          placeholder="Lý do hoàn tác"
          onChange={(event) => onReasonChange(event.target.value)}
        />
        <Button tone="danger" disabled={locked || reason.trim().length === 0} onClick={onSubmit}>
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác kiểm định"}
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
