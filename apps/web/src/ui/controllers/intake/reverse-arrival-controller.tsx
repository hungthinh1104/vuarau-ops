"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  GoodsArrivalDto,
  GoodsArrivalReversalId,
  ReverseGoodsArrivalCommand,
} from "@vuarau/domain-contracts";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { ReverseArrivalControl } from "@/ui/patterns/intake/reverse-arrival-control.tsx";

export function ReverseArrivalController({
  arrival,
  onChanged,
}: {
  readonly arrival: GoodsArrivalDto;
  readonly onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseArrival.mutationOptions());
  const command = useCommand<ReverseGoodsArrivalCommand["payload"], GoodsArrivalDto>((envelope) =>
    mutation.mutateAsync(envelope),
  );
  const reversalId = useRef(crypto.randomUUID() as GoodsArrivalReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <ReverseArrivalControl
      arrival={arrival}
      reason={reason}
      locked={locked}
      onReasonChange={setReason}
      onSubmit={() =>
        void command.submit({
          reversalId: reversalId.current,
          arrivalId: arrival.id,
          reason: reason.trim(),
        })
      }
      feedback={
        <CommandOutcome
          command={command}
          attemptedAction="Hoàn tác hàng đến"
          onReload={onChanged}
        />
      }
    />
  );
}
