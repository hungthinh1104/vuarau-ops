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
import { InspectionForm } from "@/ui/patterns/intake/inspection-form.tsx";

const toScaled = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const result = Math.round(parsed * 1000);
  return Number.isSafeInteger(result) ? result : null;
};

export function InspectionFormController({
  line,
  maxValueScaled,
  onChanged,
}: {
  readonly line: GoodsArrivalLineInput;
  readonly maxValueScaled: number;
  readonly onChanged: () => void;
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
    (envelope) => mutation.mutateAsync(envelope),
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
    <InspectionForm
      line={line}
      maxValueScaled={maxValueScaled}
      issueCodes={issueCodes.data?.items ?? []}
      quantity={quantity}
      issueId={issueId}
      severity={severity}
      issueNote={issueNote}
      note={note}
      evidence={evidence}
      valueScaled={valueScaled}
      locked={locked}
      onQuantityChange={setQuantity}
      onIssueChange={setIssueId}
      onSeverityChange={setSeverity}
      onIssueNoteChange={setIssueNote}
      onNoteChange={setNote}
      onEvidenceChange={setEvidence}
      onSubmit={() =>
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
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Ghi nhận kiểm hàng"
          onReload={onChanged}
        />
      }
    />
  );
}
