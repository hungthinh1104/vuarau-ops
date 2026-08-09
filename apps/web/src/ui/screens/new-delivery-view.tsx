"use client";

import type { SaleDetailDto, SaleFulfilmentDto, SaleId } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { hasDeliverableLines } from "@/ui/domain/delivery-form.ts";
import { formatQuantityInput } from "@/ui/domain/numeric-text.ts";
import { copyForBlockedReason } from "@/ui/copy.ts";
import { formatQuantity } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { Checkbox } from "@/ui/primitives/checkbox.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageFrame, PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function NewDeliveryPermissionView() {
  return <p role="alert">Bạn không có quyền tạo đơn giao.</p>;
}

export function NewDeliveryView(props: {
  readonly saleId: SaleId;
  readonly detail: SaleDetailDto;
  readonly fulfilment: SaleFulfilmentDto;
  readonly quantities: Readonly<Record<string, string>>;
  readonly note: string;
  readonly evidence: string;
  readonly onsiteCompletion: boolean;
  readonly command: CommandOutcomeView;
  readonly dispatchCommand: CommandOutcomeView;
  readonly deliveredCommand: CommandOutcomeView;
  readonly partialCompletion: { readonly deliveryId: string; readonly message: string } | null;
  readonly onQuantityChange: (saleLineId: string, value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onEvidenceChange: (value: string) => void;
  readonly onOnsiteCompletionChange: (value: boolean) => void;
  readonly onSubmit: (
    action: "draft" | "dispatch",
    completeOnsite: boolean,
    quantities: Readonly<Record<string, string>>,
  ) => void;
  readonly onReload: () => void;
  readonly feedback?: ReactNode;
}) {
  const sending =
    props.command.phase.kind === "sending" ||
    props.dispatchCommand.phase.kind === "sending" ||
    props.deliveredCommand.phase.kind === "sending";
  const canSave = !sending && hasDeliverableLines(props.detail, props.fulfilment, props.quantities);
  const canDispatch = hasDeliverableLines(props.detail, props.fulfilment, props.quantities);

  return (
    <PageFrame size="narrow">
      <div className="flex flex-col gap-5">
        <PageHeader
          title={`Giao đơn ${props.detail.displayReference}`}
          description={props.detail.displayReference}
          back={{ href: `/sales/${props.saleId}`, label: "Đơn bán" }}
        />
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="font-semibold">Số lượng xuất kho</h2>
          {props.fulfilment.lines.map((summary) => {
            const saleLine = props.detail.sale.lines.find(
              (line) => line.lineId === summary.saleLineId,
            );
            if (saleLine?.productId == null || summary.fulfilmentState === "attention") {
              return (
                <p key={summary.saleLineId} role="alert" className="py-3 text-warning">
                  {summary.productName}: chưa thể tạo phiếu —{" "}
                  {copyForBlockedReason(summary.blockedReason)}.
                </p>
              );
            }
            if (summary.remaining.valueScaled === 0) {
              return (
                <p key={summary.saleLineId} className="py-3">
                  {summary.productName} · {summary.qualityGradeName ?? "Không phân loại"}: Đã giao
                  đủ
                </p>
              );
            }
            const proposed =
              props.quantities[summary.saleLineId] ?? formatQuantityInput(summary.remaining);
            return (
              <div key={summary.saleLineId} className="grid gap-2 border-b border-border py-3">
                <p className="text-body-sm">
                  {summary.productName} · {summary.qualityGradeName ?? "Không phân loại"} · còn{" "}
                  {formatQuantity(summary.remaining)}
                </p>
                <QuantityInput
                  label={`Số lượng giao ${summary.productName}${summary.qualityGradeName === null ? "" : ` · ${summary.qualityGradeName}`}`}
                  unit={summary.remaining.unit}
                  value={proposed}
                  onChange={(event) =>
                    props.onQuantityChange(summary.saleLineId, event.target.value)
                  }
                />
              </div>
            );
          })}
          <label className="mt-3 grid gap-2">
            <span>Ghi chú</span>
            <TextareaControl
              value={props.note}
              onChange={(event) => props.onNoteChange(event.target.value)}
            />
          </label>
          <label className="mt-3 grid gap-2">
            <span>Ảnh hoặc phiếu liên quan</span>
            <span className="text-caption text-ink-muted">
              Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; không tự tạo chuyển
              động kho.
            </span>
            <TextareaControl
              value={props.evidence}
              onChange={(event) => props.onEvidenceChange(event.target.value)}
            />
          </label>
        </section>
        <label className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
          <Checkbox
            checked={props.onsiteCompletion}
            onChange={(event) => props.onOnsiteCompletionChange(event.target.checked)}
            disabled={sending}
            aria-label="Khách nhận tại chỗ"
          />
          <span>
            <span className="block font-semibold">Khách nhận tại chỗ</span>
            <span className="block text-body-sm text-ink-muted">
              Chỉ chọn khi khách đã nhận ngay tại vựa; hệ thống sẽ xác nhận giao xong sau khi xuất
              kho.
            </span>
          </span>
        </label>
        <ActionDock
          label="Hành động giao đơn"
          summary={
            <div>
              <p className="text-caption font-semibold text-ink-muted">Số lượng đã chọn</p>
              <p className="text-body-sm font-semibold text-ink">Kiểm tra trước khi xuất kho</p>
            </div>
          }
          secondary={
            <Button
              tone="secondary"
              disabled={!canSave}
              onClick={() => props.onSubmit("draft", false, props.quantities)}
            >
              {sending ? "Đang lưu…" : "Lưu để giao sau"}
            </Button>
          }
          primary={
            <Button
              disabled={sending || !canDispatch}
              onClick={() => props.onSubmit("dispatch", props.onsiteCompletion, props.quantities)}
            >
              {sending
                ? "Đang xuất kho…"
                : props.onsiteCompletion
                  ? "Xuất kho & giao tại chỗ"
                  : "Xuất kho & bắt đầu giao"}
            </Button>
          }
          feedback={props.feedback}
        />
      </div>
    </PageFrame>
  );
}
