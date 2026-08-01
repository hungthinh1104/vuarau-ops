"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  GoodsArrivalDto,
  GoodsArrivalId,
  GoodsArrivalLineId,
  PurchaseId,
  RecordGoodsArrivalCommand,
} from "@vuarau/domain-contracts";
import { purchaseIdSchema } from "@vuarau/domain-contracts";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTRPC } from "@/api/providers.tsx";
import { useSession } from "@/api/session-gate.tsx";
import { useCommand } from "@/api/use-command.ts";
import { formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PermissionDenied } from "@/ui/patterns/feedback/permission-denied.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

type LineState = {
  quantity: string;
  gross: string;
  tare: string;
  containerCount: string;
  supplierLotCode: string;
  note: string;
};

const EMPTY_LINE: LineState = {
  quantity: "",
  gross: "",
  tare: "",
  containerCount: "",
  supplierLotCode: "",
  note: "",
};

const scaled = (value: string) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const result = Math.round(parsed * 1000);
  return Number.isSafeInteger(result) ? result : null;
};

export default function NewGoodsArrivalPage() {
  const rawPurchaseId = useSearchParams().get("purchaseId");
  const parsedPurchaseId = purchaseIdSchema.safeParse(rawPurchaseId);
  const purchaseId = (
    parsedPurchaseId.success ? parsedPurchaseId.data : "00000000-0000-0000-0000-000000000000"
  ) as PurchaseId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const purchase = useQuery({
    ...trpc.purchase.get.queryOptions({ workspaceId, purchaseId }),
    enabled: parsedPurchaseId.success,
  });
  const profile = useQuery(trpc.session.operationalProfile.queryOptions({ workspaceId }));
  const mutation = useMutation(trpc.intake.recordArrival.mutationOptions());
  const command = useCommand<RecordGoodsArrivalCommand["payload"], GoodsArrivalDto>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const arrivalId = useRef(crypto.randomUUID() as GoodsArrivalId);
  const lineIds = useRef(new Map<string, GoodsArrivalLineId>());
  const [vehicleReference, setVehicleReference] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Record<string, LineState>>({});

  useEffect(() => {
    if (command.result !== null) router.push(`/intake/${command.result.id}`);
  }, [command.result, router]);

  if (!parsedPurchaseId.success) return <p role="alert">Thiếu hoặc sai mã đơn mua.</p>;
  if (!session.permissions.includes("intake.record")) {
    return (
      <PermissionDenied
        attemptedAction="Ghi nhận hàng đến"
        error={{
          code: "PERMISSION_DENIED",
          message: "Role set does not carry intake.record.",
          details: { permission: "intake.record", role: session.role, roles: session.roles },
          retryable: false,
        }}
      />
    );
  }

  return (
    <QueryStates
      query={purchase}
      loadingLabel="Đang tải đơn mua"
      onRetry={() => void purchase.refetch()}
    >
      {(detail) => (
        <QueryStates
          query={profile}
          loadingLabel="Đang tải cấu hình nhận hàng"
          onRetry={() => void profile.refetch()}
        >
          {(operationalProfile) => {
            if (operationalProfile.intakeMode !== "inspected_arrival") {
              return (
                <section role="alert" className="rounded-card border border-warning p-4">
                  Vựa đang dùng luồng nhận thẳng vào kho. Hãy đổi cấu hình vận hành trước khi ghi
                  hàng đến kiểm định.
                </section>
              );
            }
            const weighing = operationalProfile.weighingMode === "gross_tare_net";
            const commandLines = detail.lines.flatMap((line) => {
              const state = lines[line.lineId] ?? EMPTY_LINE;
              const gross = scaled(state.gross);
              const tare = scaled(state.tare);
              const quantity = scaled(state.quantity);
              const valueScaled = weighing
                ? gross !== null && tare !== null
                  ? gross - tare
                  : null
                : quantity;
              if (valueScaled === null || valueScaled <= 0) return [];
              let lineId = lineIds.current.get(line.lineId);
              if (lineId === undefined) {
                lineId = crypto.randomUUID() as GoodsArrivalLineId;
                lineIds.current.set(line.lineId, lineId);
              }
              return [
                {
                  arrivalLineId: lineId,
                  purchaseLineId: line.lineId,
                  productId: line.productId,
                  productName: line.productName,
                  arrivedQuantity: { valueScaled, unit: line.quantity.unit },
                  weighing: weighing
                    ? {
                        containerCount:
                          state.containerCount.trim() === ""
                            ? null
                            : Math.max(0, Math.trunc(Number(state.containerCount))),
                        grossWeight: { valueScaled: gross!, unit: line.quantity.unit },
                        tareWeight: { valueScaled: tare!, unit: line.quantity.unit },
                        netWeight: { valueScaled, unit: line.quantity.unit },
                      }
                    : null,
                  supplierLotCode: state.supplierLotCode.trim() || null,
                  note: state.note.trim() || null,
                },
              ];
            });
            const locked = command.phase.kind === "sending" || command.phase.kind === "unknown";
            return (
              <div className="grid gap-6">
                <PageHeader
                  title="Ghi nhận hàng đến"
                  description={`Nhà cung cấp ${detail.supplierId} · ${
                    weighing ? "cân gross / tare / net" : "nhập số lượng"
                  }`}
                />
                <section className="grid gap-4 rounded-card border border-border bg-surface p-4">
                  <label className="grid gap-2 text-label">
                    Xe hoặc chuyến hàng
                    <input
                      className={INPUT_CLASS}
                      value={vehicleReference}
                      disabled={locked}
                      onChange={(event) => setVehicleReference(event.target.value)}
                      placeholder="Ví dụ: 51C-123.45"
                    />
                  </label>
                  {detail.lines.map((line) => {
                    const state = lines[line.lineId] ?? EMPTY_LINE;
                    const update = (patch: Partial<LineState>) =>
                      setLines((current) => ({
                        ...current,
                        [line.lineId]: {
                          ...EMPTY_LINE,
                          ...current[line.lineId],
                          ...patch,
                        },
                      }));
                    const gross = scaled(state.gross);
                    const tare = scaled(state.tare);
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
                              onChange={(grossValue) => update({ gross: grossValue })}
                            />
                            <NumberField
                              label="Tare"
                              value={state.tare}
                              onChange={(tareValue) => update({ tare: tareValue })}
                            />
                            <label className="grid gap-2 text-label">
                              Net
                              <output className="rounded-button border border-border bg-canvas px-3 py-2">
                                {net !== null && net > 0
                                  ? `${net / 1000} ${line.quantity.unit}`
                                  : "—"}
                              </output>
                            </label>
                            <NumberField
                              label="Số bao/thùng"
                              value={state.containerCount}
                              onChange={(containerCount) => update({ containerCount })}
                              integer
                            />
                          </div>
                        ) : (
                          <NumberField
                            label={`Số lượng (${line.quantity.unit})`}
                            value={state.quantity}
                            onChange={(quantityValue) => update({ quantity: quantityValue })}
                          />
                        )}
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="grid gap-2 text-label">
                            Mã lô từ nhà cung cấp
                            <input
                              className={INPUT_CLASS}
                              value={state.supplierLotCode}
                              onChange={(event) => update({ supplierLotCode: event.target.value })}
                            />
                          </label>
                          <label className="grid gap-2 text-label">
                            Ghi chú dòng
                            <input
                              className={INPUT_CLASS}
                              value={state.note}
                              onChange={(event) => update({ note: event.target.value })}
                            />
                          </label>
                        </div>
                      </fieldset>
                    );
                  })}
                  <label className="grid gap-2 text-label">
                    Ghi chú chuyến hàng
                    <textarea
                      className={INPUT_CLASS}
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </label>
                  <Button
                    disabled={locked || commandLines.length === 0}
                    onClick={() =>
                      void command.submit({
                        arrivalId: arrivalId.current,
                        supplierId: detail.supplierId,
                        purchaseId: detail.id,
                        vehicleReference: vehicleReference.trim() || null,
                        lines: commandLines,
                        note: note.trim() || null,
                      })
                    }
                  >
                    {locked ? "Đang ghi hàng đến" : "Xác nhận hàng đã đến"}
                  </Button>
                  <CommandOutcome
                    command={command}
                    attemptedAction="Ghi nhận hàng đến"
                    onReload={() => void purchase.refetch()}
                  />
                </section>
              </div>
            );
          }}
        </QueryStates>
      )}
    </QueryStates>
  );
}

function NumberField({
  label,
  value,
  onChange,
  integer = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  integer?: boolean;
}) {
  return (
    <label className="grid gap-2 text-label">
      {label}
      <input
        className={INPUT_CLASS}
        inputMode={integer ? "numeric" : "decimal"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
