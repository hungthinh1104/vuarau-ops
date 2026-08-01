"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalLineInput,
  QualityDispositionAllocationId,
  QualityDispositionDto,
  QualityDispositionId,
  QualityDispositionSource,
  RecordQualityDispositionCommand,
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

export function DispositionForm({
  source,
  unit,
  eligibleValueScaled,
  gradeRequired,
  allowQuarantine,
  title,
  onChanged,
}: {
  source: QualityDispositionSource;
  unit: GoodsArrivalLineInput["arrivedQuantity"]["unit"];
  eligibleValueScaled: number;
  gradeRequired: boolean;
  allowQuarantine: boolean;
  title: string;
  onChanged: () => void;
}) {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const grades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      query: "",
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const mutation = useMutation(trpc.intake.recordDisposition.mutationOptions());
  const command = useCommand<RecordQualityDispositionCommand["payload"], QualityDispositionDto>(
    (envelope) => mutation.mutateAsync(envelope as never),
  );
  const dispositionId = useRef(crypto.randomUUID() as QualityDispositionId);
  const allocationIds = useRef(new Map<string, QualityDispositionAllocationId>());
  const [accepted, setAccepted] = useState("");
  const [quarantined, setQuarantined] = useState("");
  const [rejected, setRejected] = useState("");
  const [disposed, setDisposed] = useState("");
  const [gradeId, setGradeId] = useState("");
  const [note, setNote] = useState("");

  useEffect(() => {
    if (command.result === null) return;
    onChanged();
    setAccepted("");
    setQuarantined("");
    setRejected("");
    setDisposed("");
    setGradeId("");
    setNote("");
    dispositionId.current = crypto.randomUUID() as QualityDispositionId;
    allocationIds.current.clear();
    command.reset();
  }, [command.reset, command.result, onChanged]);

  const values = { accepted, quarantined, rejected, disposed } as const;
  const selectedGrade = grades.data?.items.find((grade) => grade.id === gradeId) ?? null;
  const allocations = Object.entries(values).flatMap(([outcome, raw]) => {
    const valueScaled = toScaled(raw);
    if (valueScaled === null || valueScaled <= 0) return [];
    let allocationId = allocationIds.current.get(outcome);
    if (allocationId === undefined) {
      allocationId = crypto.randomUUID() as QualityDispositionAllocationId;
      allocationIds.current.set(outcome, allocationId);
    }
    const acceptedOutcome = outcome === "accepted";
    return [
      {
        allocationId,
        outcome: outcome as "accepted" | "quarantined" | "rejected" | "disposed",
        quantity: { valueScaled, unit },
        qualityGradeId: acceptedOutcome ? (selectedGrade?.id ?? null) : null,
        qualityGradeName: acceptedOutcome ? (selectedGrade?.name ?? null) : null,
        note: null,
      },
    ];
  });
  const total = allocations.reduce((sum, allocation) => sum + allocation.quantity.valueScaled, 0);
  const acceptedValue = toScaled(accepted) ?? 0;
  const gradeMissing = gradeRequired && acceptedValue > 0 && selectedGrade === null;
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";

  return (
    <details open className="rounded-button border border-leaf/40 p-3">
      <summary className="cursor-pointer text-label font-semibold">{title}</summary>
      <p className="mt-2 text-caption text-ink-muted">
        Có thể phân bổ tối đa {eligibleValueScaled / 1000} {unit}. Chỉ lượng chấp nhận mới tạo tồn
        kho.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <NumberInput label={`Chấp nhận (${unit})`} value={accepted} onChange={setAccepted} />
        {allowQuarantine ? (
          <NumberInput label={`Cách ly (${unit})`} value={quarantined} onChange={setQuarantined} />
        ) : null}
        <NumberInput label={`Từ chối (${unit})`} value={rejected} onChange={setRejected} />
        <NumberInput label={`Hủy bỏ (${unit})`} value={disposed} onChange={setDisposed} />
      </div>
      {acceptedValue > 0 ? (
        <label className="mt-3 grid gap-2 text-label">
          Phẩm cấp cho lượng chấp nhận {gradeRequired ? "(bắt buộc)" : "(không bắt buộc)"}
          <select
            className={INPUT_CLASS}
            value={gradeId}
            onChange={(event) => setGradeId(event.target.value)}
          >
            <option value="">Không gán phẩm cấp</option>
            {(grades.data?.items ?? []).map((grade) => (
              <option key={grade.id} value={grade.id}>
                {grade.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="mt-3 grid gap-2 text-label">
        Ghi chú quyết định
        <textarea
          className={INPUT_CLASS}
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      {total > eligibleValueScaled ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Tổng phân bổ vượt lượng có thể quyết định.
        </p>
      ) : gradeMissing ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Vựa đang bắt buộc phẩm cấp cho lượng nhập kho.
        </p>
      ) : null}
      <Button
        className="mt-3"
        disabled={locked || allocations.length === 0 || total > eligibleValueScaled || gradeMissing}
        onClick={() =>
          void command.submit({
            dispositionId: dispositionId.current,
            source,
            allocations,
            note: note.trim() || null,
          })
        }
      >
        {locked ? "Đang ghi quyết định" : "Xác nhận quyết định"}
      </Button>
      <CommandOutcome
        command={command}
        attemptedAction="Ghi quyết định chất lượng"
        onReload={onChanged}
      />
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
