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
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

export function ReverseArrivalControl({
  arrival,
  onChanged,
}: {
  arrival: GoodsArrivalDto;
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const mutation = useMutation(trpc.intake.reverseArrival.mutationOptions());
  const command = useCommand<ReverseGoodsArrivalCommand["payload"], GoodsArrivalDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const reversalId = useRef(crypto.randomUUID() as GoodsArrivalReversalId);
  const [reason, setReason] = useState("");
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  useEffect(() => {
    if (command.result !== null) onChanged();
  }, [command.result, onChanged]);
  return (
    <details className="rounded-button border border-danger/30 p-3">
      <summary className="cursor-pointer text-label font-semibold text-danger">
        Hoàn tác lần hàng đến
      </summary>
      <p className="mt-2 text-caption text-ink-muted">
        Chỉ thực hiện được sau khi mọi quyết định và kiểm định hiệu lực đã được hoàn tác.
      </p>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          className={INPUT_CLASS}
          value={reason}
          placeholder="Lý do hoàn tác hàng đến"
          onChange={(event) => setReason(event.target.value)}
        />
        <Button
          tone="danger"
          disabled={locked || reason.trim().length === 0}
          onClick={() =>
            void command.submit({
              reversalId: reversalId.current,
              arrivalId: arrival.id,
              reason: reason.trim(),
            })
          }
        >
          {locked ? "Đang hoàn tác" : "Xác nhận hoàn tác hàng đến"}
        </Button>
      </div>
      <CommandOutcome command={command} attemptedAction="Hoàn tác hàng đến" onReload={onChanged} />
    </details>
  );
}
