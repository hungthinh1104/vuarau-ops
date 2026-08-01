"use client";

import { useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalDto,
  GoodsArrivalLineInput,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { formatQuantity } from "@/ui/format.ts";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { DispositionForm } from "./disposition-form.tsx";
import { FactHistory } from "./fact-history.tsx";
import { InspectionForm } from "./inspection-form.tsx";
import { QuarantineResolution } from "./quarantine-resolution.tsx";
import { ReverseArrivalControl } from "./reverse-arrival-control.tsx";

export function ArrivalSummary({
  arrival,
  canReverse,
  onChanged,
}: {
  arrival: GoodsArrivalDto;
  canReverse: boolean;
  onChanged: () => void;
}) {
  return (
    <section className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-3">
      <div>
        <p className="text-caption text-ink-muted">Trạng thái</p>
        <Badge tone={arrival.reversal === null ? "positive" : "neutral"}>
          {arrival.reversal === null ? "Đang hiệu lực" : "Đã hoàn tác"}
        </Badge>
      </div>
      <div>
        <p className="text-caption text-ink-muted">Nhà cung cấp</p>
        <p className="text-body-sm font-semibold">{arrival.supplierId}</p>
      </div>
      <div>
        <p className="text-caption text-ink-muted">Số mặt hàng</p>
        <p className="text-body-sm font-semibold">{arrival.lines.length}</p>
      </div>
      {arrival.note ? (
        <p className="text-body-sm text-ink-muted sm:col-span-3">{arrival.note}</p>
      ) : null}
      {canReverse && arrival.reversal === null ? (
        <div className="sm:col-span-3">
          <ReverseArrivalControl arrival={arrival} onChanged={onChanged} />
        </div>
      ) : null}
    </section>
  );
}

export function ArrivalLineFlow({
  line,
  profile,
  active,
  canInspect,
  canInspectReverse,
  canDisposition,
  canDispositionReverse,
}: {
  line: GoodsArrivalLineInput;
  profile: WorkspaceOperationalProfileDto;
  active: boolean;
  canInspect: boolean;
  canInspectReverse: boolean;
  canDisposition: boolean;
  canDispositionReverse: boolean;
}) {
  const { workspaceId } = useSession();
  const trpc = useTRPC();
  const source = { type: "arrival_line" as const, arrivalLineId: line.arrivalLineId };
  const summary = useQuery(
    trpc.intake.dispositionSourceSummary.queryOptions({ workspaceId, source }),
  );
  const history = useQuery(
    trpc.intake.arrivalLineHistory.queryOptions({
      workspaceId,
      arrivalLineId: line.arrivalLineId,
    }),
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
            return (
              <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
                <LineStateHeader line={line} state={state} />
                <FactHistory
                  facts={facts}
                  canInspectReverse={canInspectReverse}
                  canDispositionReverse={canDispositionReverse}
                  onChanged={refresh}
                />
                {active && canInspect && remainingInspection > 0 ? (
                  <InspectionForm
                    line={line}
                    maxValueScaled={remainingInspection}
                    onChanged={refresh}
                  />
                ) : null}
                {active && canDisposition && state.eligibleQuantity.valueScaled > 0 ? (
                  <DispositionForm
                    source={source}
                    unit={line.arrivedQuantity.unit}
                    eligibleValueScaled={state.eligibleQuantity.valueScaled}
                    gradeRequired={profile.qualityGradeMode === "required"}
                    allowQuarantine
                    title="3. Quyết định kết quả chất lượng"
                    onChanged={refresh}
                  />
                ) : null}
                {active && canDisposition
                  ? facts.dispositions.flatMap((disposition) =>
                      disposition.reversal !== null
                        ? []
                        : disposition.allocations
                            .filter((allocation) => allocation.outcome === "quarantined")
                            .map((allocation) => (
                              <QuarantineResolution
                                key={allocation.allocationId}
                                allocation={allocation}
                                dispositions={facts.dispositions}
                                gradeRequired={profile.qualityGradeMode === "required"}
                                onChanged={refresh}
                              />
                            )),
                    )
                  : null}
              </section>
            );
          }}
        </QueryStates>
      )}
    </QueryStates>
  );
}

function LineStateHeader({
  line,
  state,
}: {
  line: GoodsArrivalLineInput;
  state: {
    sourceQuantity: GoodsArrivalLineInput["arrivedQuantity"];
    inspectedQuantity: GoodsArrivalLineInput["arrivedQuantity"] | null;
    allocatedQuantity: GoodsArrivalLineInput["arrivedQuantity"];
    eligibleQuantity: GoodsArrivalLineInput["arrivedQuantity"];
  };
}) {
  const inspected = state.inspectedQuantity?.valueScaled ?? 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-subheading font-semibold">{line.productName}</h2>
          <p className="text-body-sm text-ink-muted">
            Hàng đến {formatQuantity(line.arrivedQuantity)}
            {line.supplierLotCode ? ` · lô ${line.supplierLotCode}` : ""}
          </p>
        </div>
        <Badge tone={state.eligibleQuantity.valueScaled > 0 ? "warning" : "neutral"}>
          {state.eligibleQuantity.valueScaled > 0 ? "Chờ quyết định" : "Chưa có lượng chờ"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Đã đến"
          value={state.sourceQuantity.valueScaled}
          unit={line.arrivedQuantity.unit}
        />
        <Metric label="Đã kiểm" value={inspected} unit={line.arrivedQuantity.unit} />
        <Metric
          label="Đã phân bổ"
          value={state.allocatedQuantity.valueScaled}
          unit={line.arrivedQuantity.unit}
        />
        <Metric
          label="Có thể quyết định"
          value={state.eligibleQuantity.valueScaled}
          unit={line.arrivedQuantity.unit}
        />
      </div>
      {line.weighing ? (
        <p className="text-caption text-ink-muted">
          Gross {formatQuantity(line.weighing.grossWeight)} · tare{" "}
          {formatQuantity(line.weighing.tareWeight)} · net {formatQuantity(line.weighing.netWeight)}
        </p>
      ) : null}
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="rounded-button bg-canvas p-3">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="text-label font-semibold">
        {value / 1000} {unit}
      </p>
    </div>
  );
}
