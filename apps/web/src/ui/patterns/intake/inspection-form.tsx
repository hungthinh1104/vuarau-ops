"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalLineInput,
  QualityInspectionDto,
  QualityInspectionId,
  RecordQualityInspectionCommand,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

const toScaled = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const result = Math.round(parsed * 1000);
  return Number.isSafeInteger(result) ? result : null;
};

export function InspectionForm({
  line,
  maxValueScaled,
  onChanged,
}: {
  line: GoodsArrivalLineInput;
  maxValueScaled: number;
  onChanged: () => void;
}) {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const issueCodes = useQuery(
    trpc.intake.searchIssueCodes.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.intake.recordInspection.mutationOptions());
  const command = useCommand<RecordQualityInspectionCommand["payload"], QualityInspectionDto>(
    (envelope) => mutation.mutateAsync(envelope as never),
  );
  const inspectionId = useRef(crypto.randomUUID() as QualityInspectionId);
  const [quantity, setQuantity] = useState("");
  const [issueId, setIssueId] = useState("");
  const [severity, setSeverity] = useState<"minor" | "moderate" | "severe">("moderate");
  const [issueNote, setIssueNote] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");

  useEffect(() => {
    if (command.result === null) return;
    onChanged();
    setQuantity("");
    setIssueId("");
    setIssueNote("");
    setNote("");
    setEvidence("");
    inspectionId.current = crypto.randomUUID() as QualityInspectionId;
    command.reset();
  }, [command.reset, command.result, onChanged]);

  const valueScaled = toScaled(quantity);
  const selectedIssue = issueCodes.data?.items.find((item) => item.id === issueId) ?? null;
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  return (
    <details className="rounded-button border border-border p-3">
      <summary className="cursor-pointer text-label font-semibold">
        2. Ghi kết quả kiểm định
      </summary>
      <div className="mt-3 grid gap-3">
        <NumberInput
          label={`Lượng đã kiểm (${line.arrivedQuantity.unit}) · còn tối đa ${maxValueScaled / 1000}`}
          value={quantity}
          onChange={setQuantity}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-label">
            Vấn đề phát hiện (không bắt buộc)
            <select
              className={INPUT_CLASS}
              value={issueId}
              onChange={(event) => setIssueId(event.target.value)}
            >
              <option value="">Không ghi vấn đề</option>
              {(issueCodes.data?.items ?? []).map((issue) => (
                <option key={issue.id} value={issue.id}>
                  {issue.code} · {issue.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-label">
            Mức độ
            <select
              className={INPUT_CLASS}
              value={severity}
              disabled={issueId === ""}
              onChange={(event) =>
                setSeverity(event.target.value as "minor" | "moderate" | "severe")
              }
            >
              <option value="minor">Nhẹ</option>
              <option value="moderate">Vừa</option>
              <option value="severe">Nặng</option>
            </select>
          </label>
        </div>
        <label className="grid gap-2 text-label">
          Ghi chú vấn đề
          <input
            className={INPUT_CLASS}
            value={issueNote}
            disabled={issueId === ""}
            onChange={(event) => setIssueNote(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-label">
          Bằng chứng (mỗi đường dẫn cách nhau bằng dấu phẩy)
          <input
            className={INPUT_CLASS}
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-label">
          Ghi chú kiểm định
          <textarea
            className={INPUT_CLASS}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <Button
          disabled={
            locked || valueScaled === null || valueScaled <= 0 || valueScaled > maxValueScaled
          }
          onClick={() =>
            void command.submit({
              inspectionId: inspectionId.current,
              arrivalLineId: line.arrivalLineId,
              inspectedQuantity: { valueScaled: valueScaled!, unit: line.arrivedQuantity.unit },
              issues:
                selectedIssue === null
                  ? []
                  : [
                      {
                        qualityIssueCodeId: selectedIssue.id,
                        qualityIssueCode: selectedIssue.code,
                        qualityIssueName: selectedIssue.displayName,
                        severity,
                        note: issueNote.trim() || null,
                      },
                    ],
              note: note.trim() || null,
              evidenceReferences: evidence
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean),
            })
          }
        >
          {locked ? "Đang ghi kiểm định" : "Xác nhận kiểm định"}
        </Button>
        <CommandOutcome
          command={command}
          attemptedAction="Ghi nhận kiểm định"
          onReload={onChanged}
        />
      </div>
    </details>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-label">
      {label}
      <input
        className={INPUT_CLASS}
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
