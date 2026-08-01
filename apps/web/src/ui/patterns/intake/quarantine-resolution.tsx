"use client";

import { useQuery } from "@tanstack/react-query";
import type { QualityDispositionDto } from "@vuarau/domain-contracts";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { formatQuantity } from "@/ui/format.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { DispositionForm } from "./disposition-form.tsx";

export function QuarantineResolution({
  allocation,
  dispositions,
  gradeRequired,
  onChanged,
}: {
  allocation: QualityDispositionDto["allocations"][number];
  dispositions: readonly QualityDispositionDto[];
  gradeRequired: boolean;
  onChanged: () => void;
}) {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const source = {
    type: "quarantine_allocation" as const,
    allocationId: allocation.allocationId,
  };
  const summary = useQuery(
    trpc.intake.dispositionSourceSummary.queryOptions({ workspaceId, source }),
  );
  const activeChild = dispositions.some(
    (disposition) =>
      disposition.reversal === null &&
      disposition.source.type === "quarantine_allocation" &&
      disposition.source.allocationId === allocation.allocationId,
  );
  return (
    <QueryStates
      query={summary}
      loadingLabel="Đang kiểm tra lượng cách ly"
      onRetry={() => void summary.refetch()}
    >
      {(state) =>
        activeChild || state.eligibleQuantity.valueScaled === 0 ? (
          <section className="rounded-button border border-border bg-canvas p-3 text-body-sm text-ink-muted">
            Lượng cách ly {formatQuantity(allocation.quantity)} đã có quyết định xử lý hiệu lực.
          </section>
        ) : (
          <DispositionForm
            source={source}
            unit={allocation.quantity.unit}
            eligibleValueScaled={state.eligibleQuantity.valueScaled}
            gradeRequired={gradeRequired}
            allowQuarantine={false}
            title={`Xử lý lại lượng cách ly ${formatQuantity(allocation.quantity)}`}
            onChanged={() => {
              void summary.refetch();
              onChanged();
            }}
          />
        )
      }
    </QueryStates>
  );
}
