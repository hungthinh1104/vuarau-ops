"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  QualityDispositionAllocationId,
  QualityDispositionDto,
  QualityDispositionId,
  RecordQualityDispositionCommand,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import {
  DispositionForm,
  type DispositionFormProps,
  type DispositionValueKey,
  type DispositionValues,
} from "@/ui/patterns/intake/disposition-form.tsx";

const toScaled = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const result = Math.round(parsed * 1000);
  return Number.isSafeInteger(result) ? result : null;
};

type ControllerProps = Pick<
  DispositionFormProps,
  "source" | "unit" | "eligibleValueScaled" | "gradeRequired" | "allowQuarantine" | "title"
> & { readonly onChanged: () => void };

export function DispositionFormController({
  source,
  unit,
  eligibleValueScaled,
  gradeRequired,
  allowQuarantine,
  title,
  onChanged,
}: ControllerProps) {
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
    (envelope) => mutation.mutateAsync(envelope),
  );
  const dispositionId = useRef(crypto.randomUUID() as QualityDispositionId);
  const allocationIds = useRef(new Map<string, QualityDispositionAllocationId>());
  const [values, setValues] = useState<DispositionValues>({
    accepted: "",
    quarantined: "",
    rejected: "",
    disposed: "",
  });
  const [gradeId, setGradeId] = useState("");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");

  useEffect(() => {
    if (command.result === null) return;
    onChanged();
    setValues({ accepted: "", quarantined: "", rejected: "", disposed: "" });
    setGradeId("");
    setNote("");
    setEvidence("");
    dispositionId.current = crypto.randomUUID() as QualityDispositionId;
    allocationIds.current.clear();
    command.reset();
  }, [command.reset, command.result, onChanged]);

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
  const acceptedValue = toScaled(values.accepted) ?? 0;
  const gradeMissing = gradeRequired && acceptedValue > 0 && selectedGrade === null;
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  const onValueChange = (key: DispositionValueKey, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));

  return (
    <DispositionForm
      source={source}
      unit={unit}
      eligibleValueScaled={eligibleValueScaled}
      gradeRequired={gradeRequired}
      allowQuarantine={allowQuarantine}
      title={title}
      grades={grades.data?.items ?? []}
      values={values}
      gradeId={gradeId}
      note={note}
      evidence={evidence}
      total={total}
      gradeMissing={gradeMissing}
      locked={locked}
      onValueChange={onValueChange}
      onGradeChange={setGradeId}
      onNoteChange={setNote}
      onEvidenceChange={setEvidence}
      onSubmit={() =>
        void command.submit({
          dispositionId: dispositionId.current,
          source,
          allocations,
          note: note.trim() || null,
          evidenceReferences: parseSourceEvidence(evidence),
        })
      }
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Ghi quyết định chất lượng"
          onReload={onChanged}
        />
      }
    />
  );
}
