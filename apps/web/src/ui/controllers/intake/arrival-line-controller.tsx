"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalLineInput,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  ArrivalLineFlow,
  type ArrivalLineState,
} from "@/ui/patterns/intake/arrival-detail-flow.tsx";
import { DispositionFormController } from "@/ui/controllers/intake/disposition-form-controller.tsx";
import { FactHistoryController } from "@/ui/controllers/intake/fact-history-controller.tsx";
import { InspectionFormController } from "@/ui/controllers/intake/inspection-form-controller.tsx";
import { QuarantineResolutionController } from "@/ui/controllers/intake/quarantine-resolution-controller.tsx";

export function ArrivalLineController({
  line,
  profile,
  active,
  canInspect,
  canInspectReverse,
  canDisposition,
  canDispositionReverse,
}: {
  readonly line: GoodsArrivalLineInput;
  readonly profile: WorkspaceOperationalProfileDto;
  readonly active: boolean;
  readonly canInspect: boolean;
  readonly canInspectReverse: boolean;
  readonly canDisposition: boolean;
  readonly canDispositionReverse: boolean;
}) {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const source = { type: "arrival_line" as const, arrivalLineId: line.arrivalLineId };
  const summary = useQuery(
    trpc.intake.dispositionSourceSummary.queryOptions({ workspaceId, source }),
  );
  const history = useQuery(
    trpc.intake.arrivalLineHistory.queryOptions({ workspaceId, arrivalLineId: line.arrivalLineId }),
  );
  const refresh = () => void Promise.all([summary.refetch(), history.refetch()]);
  return (
    <QueryStates
      query={summary}
      loadingLabel={`Đang kiểm tra ${line.productName}`}
      onRetry={() => void summary.refetch()}
    >
      {(state) => (
        <QueryStates
          query={history}
          loadingLabel={`Đang tải lịch sử ${line.productName}`}
          onRetry={() => void history.refetch()}
        >
          {(facts) => {
            const inspected = state.inspectedQuantity?.valueScaled ?? 0;
            const remainingInspection = Math.max(0, state.sourceQuantity.valueScaled - inspected);
            const lineState: ArrivalLineState = state;
            return (
              <ArrivalLineFlow
                line={line}
                profile={profile}
                state={lineState}
                active={active}
                history={
                  <FactHistoryController
                    facts={facts}
                    canInspectReverse={canInspectReverse}
                    canDispositionReverse={canDispositionReverse}
                    onChanged={refresh}
                  />
                }
                inspection={
                  active && canInspect && remainingInspection > 0 ? (
                    <InspectionFormController
                      line={line}
                      maxValueScaled={remainingInspection}
                      onChanged={refresh}
                    />
                  ) : undefined
                }
                disposition={
                  active && canDisposition && state.eligibleQuantity.valueScaled > 0 ? (
                    <DispositionFormController
                      source={source}
                      unit={line.arrivedQuantity.unit}
                      eligibleValueScaled={state.eligibleQuantity.valueScaled}
                      gradeRequired={profile.qualityGradeMode === "required"}
                      allowQuarantine
                      title="2. Kết quả kiểm hàng"
                      onChanged={refresh}
                    />
                  ) : undefined
                }
                quarantine={
                  active && canDisposition
                    ? facts.dispositions.flatMap((disposition) =>
                        disposition.reversal !== null
                          ? []
                          : disposition.allocations
                              .filter((allocation) => allocation.outcome === "quarantined")
                              .map((allocation) => (
                                <QuarantineResolutionController
                                  key={allocation.allocationId}
                                  allocation={allocation}
                                  dispositions={facts.dispositions}
                                  gradeRequired={profile.qualityGradeMode === "required"}
                                  onChanged={refresh}
                                />
                              )),
                      )
                    : undefined
                }
              />
            );
          }}
        </QueryStates>
      )}
    </QueryStates>
  );
}
