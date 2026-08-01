"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  ArrivalLineHistoryDto,
  QualityDispositionDto,
  QualityDispositionReversalId,
  QualityInspectionDto,
  QualityInspectionReversalId,
  ReverseQualityDispositionCommand,
  ReverseQualityInspectionCommand,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

export function FactHistory({
  facts,
  canInspectReverse,
  canDispositionReverse,
  onChanged,
}: {
  facts: ArrivalLineHistoryDto;
  canInspectReverse: boolean;
  canDispositionReverse: boolean;
  onChanged: () => void;
}) {
  if (facts.inspections.length === 0 && facts.dispositions.length === 0) {
    return (
      <section className="rounded-button bg-canvas p-3 text-body-sm text-ink-muted">
        Chưa có kiểm định hoặc quyết định chất lượng.
      </section>
    );
  }
  return (
    <details className="rounded-button border border-border p-3">
      <summary className="cursor-pointer text-label font-semibold">
        Lịch sử kiểm định và quyết định ({facts.inspections.length + facts.dispositions.length})
      </summary>
      <div className="mt-3 grid gap-3">
        {facts.inspections.map((inspection) => (
          <article key={inspection.id} className="rounded-button bg-canvas p-3">
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
            {canInspectReverse && inspection.reversal === null ? (
              <ReverseInspectionControl inspection={inspection} onChanged={onChanged} />
            ) : null}
          </article>
        ))}
        {facts.dispositions.map((disposition) => (
          <article key={disposition.id} className="rounded-button bg-canvas p-3">
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
            {canDispositionReverse && disposition.reversal === null ? (
              <ReverseDispositionControl disposition={disposition} onChanged={onChanged} />
            ) : null}
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

function ReverseInspectionControl({
  inspection,
  onChanged,
}: {
  inspection: QualityInspectionDto;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseInspection.mutationOptions());
  const command = useCommand<ReverseQualityInspectionCommand["payload"], QualityInspectionDto>(
    (envelope) => mutation.mutateAsync(envelope as never),
  );
  const reversalId = useRef(crypto.randomUUID() as QualityInspectionReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <details className="mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer text-caption font-semibold text-danger">
        Hoàn tác kiểm định
      </summary>
      <div className="mt-2 grid gap-2">
        <input
          className={INPUT_CLASS}
          value={reason}
          placeholder="Lý do hoàn tác"
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          tone="danger"
          disabled={locked || reason.trim().length === 0}
          onClick={() =>
            void command.submit({
              reversalId: reversalId.current,
              inspectionId: inspection.id,
              reason: reason.trim(),
            })
          }
        >
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác kiểm định"}
        </Button>
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác kiểm định"
          onReload={onChanged}
        />
      </div>
    </details>
  );
}

function ReverseDispositionControl({
  disposition,
  onChanged,
}: {
  disposition: QualityDispositionDto;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseDisposition.mutationOptions());
  const command = useCommand<ReverseQualityDispositionCommand["payload"], QualityDispositionDto>(
    (envelope) => mutation.mutateAsync(envelope as never),
  );
  const reversalId = useRef(crypto.randomUUID() as QualityDispositionReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <details className="mt-3 border-t border-border pt-2">
      <summary className="cursor-pointer text-caption font-semibold text-danger">
        Hoàn tác quyết định
      </summary>
      <div className="mt-2 grid gap-2">
        <input
          className={INPUT_CLASS}
          value={reason}
          placeholder="Hoàn tác fact con trước fact cha"
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          tone="danger"
          disabled={locked || reason.trim().length === 0}
          onClick={() =>
            void command.submit({
              reversalId: reversalId.current,
              dispositionId: disposition.id,
              reason: reason.trim(),
            })
          }
        >
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác quyết định"}
        </Button>
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác quyết định chất lượng"
          onReload={onChanged}
        />
      </div>
    </details>
  );
}
