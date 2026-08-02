"use client";

import type { SaleDetailDto, SaleFulfilmentDto, SaleId } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function NewDeliveryPermissionView() {
  return <p role="alert">Bạn không có quyền tạo phiếu giao hàng.</p>;
}

export function NewDeliveryView(props: {
  readonly saleId: SaleId;
  readonly detail: SaleDetailDto;
  readonly fulfilment: SaleFulfilmentDto | undefined;
  readonly quantities: Readonly<Record<string, string>>;
  readonly note: string;
  readonly command: CommandOutcomeView;
  readonly onQuantityChange: (saleLineId: string, value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  const blocked =
    props.command.phase.kind === "sending" ||
    props.fulfilment === undefined ||
    props.fulfilment.lines.every(
      (line) => line.fulfilmentState === "attention" || line.remaining.valueScaled === 0,
    ) ||
    props.fulfilment.lines.some((line) => {
      const valueScaled = Math.round(
        Number(props.quantities[line.saleLineId] ?? String(line.remaining.valueScaled / 1_000)) *
          1_000,
      );
      return (
        line.fulfilmentState !== "attention" &&
        line.remaining.valueScaled > 0 &&
        (!Number.isSafeInteger(valueScaled) ||
          valueScaled <= 0 ||
          valueScaled > line.remaining.valueScaled)
      );
    });

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <PageHeader
        title="Tạo phiếu giao"
        description={props.detail.displayReference}
        back={{ href: `/sales/${props.saleId}`, label: "Đơn bán" }}
      />
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="font-semibold">Số lượng xuất kho</h2>
        {props.fulfilment?.lines.map((summary) => {
          const saleLine = props.detail.sale.lines.find(
            (line) => line.lineId === summary.saleLineId,
          );
          if (
            saleLine?.productId == null ||
            saleLine.qualityGradeId == null ||
            summary.fulfilmentState === "attention"
          ) {
            return (
              <p key={summary.saleLineId} role="alert" className="py-3 text-warning">
                {summary.productName}: không thể soạn phiếu —{" "}
                {summary.blockedReason ?? "dữ liệu thực hiện không toàn vẹn"}.
              </p>
            );
          }
          if (summary.remaining.valueScaled === 0) {
            return (
              <p key={summary.saleLineId} className="py-3">
                {summary.productName} · {summary.qualityGradeName}: Đã giao đủ
              </p>
            );
          }
          const proposed =
            props.quantities[summary.saleLineId] ?? String(summary.remaining.valueScaled / 1_000);
          return (
            <label key={summary.saleLineId} className="grid gap-2 border-b border-border py-3">
              <span>
                {summary.productName} · {summary.qualityGradeName} · còn{" "}
                {formatQuantity(summary.remaining)}
              </span>
              <Input
                inputMode="decimal"
                value={proposed}
                onChange={(event) => props.onQuantityChange(summary.saleLineId, event.target.value)}
                aria-label={`Số lượng giao ${summary.productName}`}
              />
            </label>
          );
        })}
        <label className="mt-3 grid gap-2">
          <span>Ghi chú</span>
          <TextareaControl
            value={props.note}
            onChange={(event) => props.onNoteChange(event.target.value)}
          />
        </label>
      </section>
      <Button disabled={blocked} onClick={props.onSubmit}>
        Soạn phiếu giao
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu phiếu giao"
        onReload={props.onReload}
      />
    </div>
  );
}
