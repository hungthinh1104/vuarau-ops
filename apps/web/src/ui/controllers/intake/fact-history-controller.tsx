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
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import {
  FactHistory,
  ReverseDispositionControl,
  ReverseInspectionControl,
} from "@/ui/patterns/intake/fact-history.tsx";

export function FactHistoryController({
  facts,
  canInspectReverse,
  canDispositionReverse,
  onChanged,
}: {
  readonly facts: ArrivalLineHistoryDto;
  readonly canInspectReverse: boolean;
  readonly canDispositionReverse: boolean;
  readonly onChanged: () => void;
}) {
  return (
    <FactHistory
      facts={facts}
      canInspectReverse={canInspectReverse}
      canDispositionReverse={canDispositionReverse}
      onChanged={onChanged}
      renderInspectionReverse={(inspection) => (
        <ReverseInspectionController
          key={inspection.id}
          inspection={inspection}
          onChanged={onChanged}
        />
      )}
      renderDispositionReverse={(disposition) => (
        <ReverseDispositionController
          key={disposition.id}
          disposition={disposition}
          onChanged={onChanged}
        />
      )}
    />
  );
}

function ReverseInspectionController({
  inspection,
  onChanged,
}: {
  readonly inspection: QualityInspectionDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseInspection.mutationOptions());
  const command = useCommand<ReverseQualityInspectionCommand["payload"], QualityInspectionDto>(
    (envelope) => mutation.mutateAsync(envelope),
  );
  const reversalId = useRef(crypto.randomUUID() as QualityInspectionReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <ReverseInspectionControl
      reason={reason}
      locked={locked}
      onReasonChange={setReason}
      onSubmit={() =>
        void command.submit({
          reversalId: reversalId.current,
          inspectionId: inspection.id,
          reason: reason.trim(),
        })
      }
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác kiểm hàng"
          onReload={onChanged}
        />
      }
    />
  );
}

function ReverseDispositionController({
  disposition,
  onChanged,
}: {
  readonly disposition: QualityDispositionDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseDisposition.mutationOptions());
  const command = useCommand<ReverseQualityDispositionCommand["payload"], QualityDispositionDto>(
    (envelope) => mutation.mutateAsync(envelope),
  );
  const reversalId = useRef(crypto.randomUUID() as QualityDispositionReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <ReverseDispositionControl
      reason={reason}
      locked={locked}
      onReasonChange={setReason}
      onSubmit={() =>
        void command.submit({
          reversalId: reversalId.current,
          dispositionId: disposition.id,
          reason: reason.trim(),
          evidenceReferences: [],
        })
      }
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác quyết định chất lượng"
          onReload={onChanged}
        />
      }
    />
  );
}
