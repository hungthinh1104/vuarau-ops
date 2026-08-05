"use client";

import { useQuery } from "@tanstack/react-query";
import type { QualityDispositionDto } from "@vuarau/domain-contracts";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { DispositionFormController } from "@/ui/controllers/intake/disposition-form-controller.tsx";
import { QuarantineResolution } from "@/ui/patterns/intake/quarantine-resolution.tsx";

export function QuarantineResolutionController({
  allocation,
  dispositions,
  gradeRequired,
  onChanged,
}: {
  readonly allocation: QualityDispositionDto["allocations"][number];
  readonly dispositions: readonly QualityDispositionDto[];
  readonly gradeRequired: boolean;
  readonly onChanged: () => void;
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
      loadingLabel="Đang kiểm tra lượng tạm giữ"
      onRetry={() => void summary.refetch()}
    >
      {(state) => (
        <QuarantineResolution
          allocation={allocation}
          activeChild={activeChild}
          eligibleValueScaled={state.eligibleQuantity.valueScaled}
          child={
            <DispositionFormController
              source={source}
              unit={allocation.quantity.unit}
              eligibleValueScaled={state.eligibleQuantity.valueScaled}
              gradeRequired={gradeRequired}
              allowQuarantine={false}
              title={`Xử lý lại lượng tạm giữ ${allocation.quantity.valueScaled / 1000} ${allocation.quantity.unit}`}
              onChanged={() => {
                void summary.refetch();
                onChanged();
              }}
            />
          }
        />
      )}
    </QueryStates>
  );
}
