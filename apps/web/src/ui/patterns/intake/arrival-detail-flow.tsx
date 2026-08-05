"use client";

import type {
  GoodsArrivalDto,
  GoodsArrivalLineInput,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatQuantity } from "@/ui/format.ts";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";

export type ArrivalLineState = {
  readonly sourceQuantity: GoodsArrivalLineInput["arrivedQuantity"];
  readonly inspectedQuantity: GoodsArrivalLineInput["arrivedQuantity"] | null;
  readonly allocatedQuantity: GoodsArrivalLineInput["arrivedQuantity"];
  readonly eligibleQuantity: GoodsArrivalLineInput["arrivedQuantity"];
};

export function ArrivalSummary({
  arrival,
  canReverse,
  reverseControl,
}: {
  readonly arrival: GoodsArrivalDto;
  readonly canReverse: boolean;
  readonly reverseControl?: ReactNode;
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
      <SourceEvidenceList
        references={arrival.evidenceReferences}
        className="sm:col-span-3 border-t border-border pt-2"
      />
      {canReverse && arrival.reversal === null && reverseControl !== undefined ? (
        <div className="sm:col-span-3">{reverseControl}</div>
      ) : null}
    </section>
  );
}

export function ArrivalLineFlow({
  line,
  state,
  active,
  history,
  inspection,
  disposition,
  quarantine,
}: {
  readonly line: GoodsArrivalLineInput;
  readonly profile: WorkspaceOperationalProfileDto;
  readonly state: ArrivalLineState;
  readonly active: boolean;
  readonly history: ReactNode;
  readonly inspection?: ReactNode;
  readonly disposition?: ReactNode;
  readonly quarantine?: ReactNode;
}) {
  const inspected = state.inspectedQuantity?.valueScaled ?? 0;
  return (
    <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
      <LineStateHeader line={line} state={state} />
      {history}
      {active && (inspection !== undefined || disposition !== undefined) ? (
        <div className="grid gap-3 rounded-card border border-brand/20 bg-canvas p-3">
          <div>
            <h3 className="font-semibold">Kiểm hàng và xử lý</h3>
            <p className="text-body-sm text-ink-muted">
              Ghi một lần kiểm hàng, sau đó chia số lượng đạt, tạm giữ, trả nhà cung cấp hoặc loại
              bỏ.
            </p>
          </div>
          {inspection}
          {disposition}
        </div>
      ) : null}
      {active && quarantine !== undefined ? quarantine : null}
      {active && inspected > state.sourceQuantity.valueScaled ? (
        <p role="alert" className="text-caption text-danger">
          Số lượng kiểm hàng không thể vượt số lượng đã nhận.
        </p>
      ) : null}
    </section>
  );
}

function LineStateHeader({
  line,
  state,
}: {
  readonly line: GoodsArrivalLineInput;
  readonly state: ArrivalLineState;
}) {
  const inspected = state.inspectedQuantity?.valueScaled ?? 0;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-subheading font-semibold">{line.productName}</h2>
          <p className="text-body-sm text-ink-muted">
            Đã nhận {formatQuantity(line.arrivedQuantity)}
            {line.supplierLotCode ? ` · lô ${line.supplierLotCode}` : ""}
          </p>
        </div>
        <Badge tone={state.eligibleQuantity.valueScaled > 0 ? "warning" : "neutral"}>
          {state.eligibleQuantity.valueScaled > 0 ? "Chờ quyết định" : "Chưa có lượng chờ"}
        </Badge>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric
          label="Đã nhận"
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
          Tổng cân {formatQuantity(line.weighing.grossWeight)} · Trọng lượng bì{" "}
          {formatQuantity(line.weighing.tareWeight)} · Khối lượng hàng{" "}
          {formatQuantity(line.weighing.netWeight)}
        </p>
      ) : null}
      {line.note ? (
        <p className="text-caption text-ink-muted">Ghi chú nhận hàng: {line.note}</p>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  unit,
}: {
  readonly label: string;
  readonly value: number;
  readonly unit: string;
}) {
  return (
    <div className="rounded-card bg-canvas p-3">
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="text-label font-semibold">
        {value / 1000} {unit}
      </p>
    </div>
  );
}
