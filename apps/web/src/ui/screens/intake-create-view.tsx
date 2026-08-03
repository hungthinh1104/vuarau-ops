"use client";

import type {
  PurchaseDto,
  RecordGoodsArrivalCommand,
  WorkspaceOperationalProfileDto,
} from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import {
  EMPTY_INTAKE_LINE,
  scaledQuantity,
  type IntakeLineState,
} from "@/ui/domain/intake-form.ts";
import { formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type IntakeCreateViewProps = {
  readonly validPurchaseId: boolean;
  readonly canRecord: boolean;
  readonly role: string;
  readonly roles: readonly string[];
  readonly purchase: QueryLike<PurchaseDto>;
  readonly profile: QueryLike<WorkspaceOperationalProfileDto>;
  readonly vehicleReference: string;
  readonly note: string;
  readonly evidence?: string;
  readonly lines: Readonly<Record<string, IntakeLineState>>;
  readonly commandLines: RecordGoodsArrivalCommand["payload"]["lines"];
  readonly command: CommandOutcomeView;
  readonly onVehicleReference: (value: string) => void;
  readonly onNote: (value: string) => void;
  readonly onEvidence?: (value: string) => void;
  readonly onLineChange: (lineId: string, patch: Partial<IntakeLineState>) => void;
  readonly onSubmit: () => void;
  readonly onPurchaseRetry: () => void;
  readonly onProfileRetry: () => void;
};

export function IntakeCreateView(props: IntakeCreateViewProps) {
  if (!props.validPurchaseId) return <p role="alert">Thiếu hoặc sai mã đơn mua.</p>;
  if (!props.canRecord) {
    return (
      <PermissionDenied
        attemptedAction="Ghi nhận hàng đến"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry intake.record.",
          details: { permission: "intake.record", role: props.role, roles: props.roles },
          retryable: false,
        }}
      />
    );
  }

  return (
    <QueryStates
      query={props.purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={props.onPurchaseRetry}
    >
      {(detail) => (
        <QueryStates
          query={props.profile}
          loadingLabel="Đang tải cấu hình nhận hàng"
          onRetry={props.onProfileRetry}
        >
          {(operationalProfile) => (
            <IntakeForm
              detail={detail}
              operationalProfile={operationalProfile}
              vehicleReference={props.vehicleReference}
              note={props.note}
              evidence={props.evidence ?? ""}
              lines={props.lines}
              commandLines={props.commandLines}
              command={props.command}
              onVehicleReference={props.onVehicleReference}
              onNote={props.onNote}
              onEvidence={props.onEvidence ?? (() => undefined)}
              onLineChange={props.onLineChange}
              onSubmit={props.onSubmit}
              onRetry={props.onPurchaseRetry}
            />
          )}
        </QueryStates>
      )}
    </QueryStates>
  );
}

function IntakeForm({
  detail,
  operationalProfile,
  vehicleReference,
  note,
  evidence = "",
  lines,
  commandLines,
  command,
  onVehicleReference,
  onNote,
  onEvidence = () => undefined,
  onLineChange,
  onSubmit,
  onRetry,
}: Omit<
  IntakeCreateViewProps,
  | "validPurchaseId"
  | "canRecord"
  | "role"
  | "roles"
  | "purchase"
  | "profile"
  | "onPurchaseRetry"
  | "onProfileRetry"
> & {
  readonly detail: PurchaseDto;
  readonly operationalProfile: WorkspaceOperationalProfileDto;
  readonly onRetry: () => void;
}) {
  if (operationalProfile.intakeMode !== "inspected_arrival") {
    return (
      <section role="alert" className="rounded-card border border-warning p-4">
        Vựa đang dùng luồng nhận thẳng vào kho. Hãy đổi cấu hình vận hành trước khi ghi hàng đến
        kiểm định.
      </section>
    );
  }
  const weighing = operationalProfile.weighingMode === "gross_tare_net";
  const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
  return (
    <div className="grid gap-6">
      <PageHeader
        title="Ghi nhận hàng đến"
        description={`Nhà cung cấp ${detail.supplierId} · ${weighing ? "cân gross / tare / net" : "nhập số lượng"}`}
      />
      <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
        <label className="grid gap-2 text-label">
          Xe hoặc chuyến hàng
          <Input
            value={vehicleReference}
            disabled={locked}
            onChange={(event) => onVehicleReference(event.target.value)}
            placeholder="Ví dụ: 51C-123.45"
          />
        </label>
        <Textarea
          label="Nguồn chứng cứ vận hành"
          value={evidence}
          disabled={locked}
          onChange={(event) => onEvidence(event.target.value)}
          hint="Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; đây chỉ là metadata nguồn."
        />
        {detail.lines.map((line) => {
          const state = lines[line.lineId] ?? EMPTY_INTAKE_LINE;
          const gross = scaledQuantity(state.gross);
          const tare = scaledQuantity(state.tare);
          const net = gross !== null && tare !== null ? gross - tare : null;
          return (
            <fieldset
              key={line.lineId}
              className="grid gap-3 border-t border-border pt-4 first:border-0 first:pt-0"
            >
              <legend className="text-label font-semibold">
                {line.productName} · đặt {formatQuantity(line.quantity)}
              </legend>
              {weighing ? (
                <div className="grid gap-3 sm:grid-cols-4">
                  <NumberField
                    label="Gross"
                    value={state.gross}
                    onChange={(value) => onLineChange(line.lineId, { gross: value })}
                  />
                  <NumberField
                    label="Tare"
                    value={state.tare}
                    onChange={(value) => onLineChange(line.lineId, { tare: value })}
                  />
                  <label className="grid gap-2 text-label">
                    Net
                    <output className="rounded-input border border-border bg-canvas px-3 py-2">
                      {net !== null && net > 0 ? `${net / 1000} ${line.quantity.unit}` : "—"}
                    </output>
                  </label>
                  <NumberField
                    label="Số bao/thùng"
                    value={state.containerCount}
                    integer
                    onChange={(value) => onLineChange(line.lineId, { containerCount: value })}
                  />
                </div>
              ) : (
                <NumberField
                  label={`Số lượng (${line.quantity.unit})`}
                  value={state.quantity}
                  onChange={(value) => onLineChange(line.lineId, { quantity: value })}
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-label">
                  Mã lô từ nhà cung cấp
                  <Input
                    value={state.supplierLotCode}
                    onChange={(event) =>
                      onLineChange(line.lineId, { supplierLotCode: event.target.value })
                    }
                  />
                </label>
                <label className="grid gap-2 text-label">
                  Ghi chú dòng
                  <Input
                    value={state.note}
                    onChange={(event) => onLineChange(line.lineId, { note: event.target.value })}
                  />
                </label>
              </div>
            </fieldset>
          );
        })}
        <label className="grid gap-2 text-label">
          Ghi chú chuyến hàng
          <TextareaControl value={note} onChange={(event) => onNote(event.target.value)} />
        </label>
        <Button disabled={locked || commandLines.length === 0} onClick={onSubmit}>
          {locked ? "Đang ghi hàng đến" : "Xác nhận hàng đã đến"}
        </Button>
        <CommandOutcome command={command} attemptedAction="Ghi nhận hàng đến" onReload={onRetry} />
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  integer = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly integer?: boolean;
}) {
  return (
    <label className="grid gap-2 text-label">
      {label}
      <Input
        inputMode={integer ? "numeric" : "decimal"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
