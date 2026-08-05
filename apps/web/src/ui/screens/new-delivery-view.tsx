"use client";

import type { SaleDetailDto, SaleFulfilmentDto, SaleId } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { hasDeliverableLines } from "@/ui/domain/delivery-form.ts";
import { copyForBlockedReason } from "@/ui/copy.ts";
import { formatQuantity } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { Checkbox } from "@/ui/primitives/checkbox.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function NewDeliveryPermissionView() {
  return <p role="alert">Bạn không có quyền tạo phiếu giao hàng.</p>;
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
  readonly onSubmit: (action: "draft" | "dispatch", completeOnsite: boolean) => void;
  readonly onReload: () => void;
  readonly feedback?: ReactNode;
}) {
  const sending =
    props.command.phase.kind === "sending" ||
    props.dispatchCommand.phase.kind === "sending" ||
    props.deliveredCommand.phase.kind === "sending";
  const canSave = !sending && hasDeliverableLines(props.detail, props.fulfilment, props.quantities);
  const canDeliverAll = hasDeliverableLines(props.detail, props.fulfilment, {});

  return (
    <div className="flex max-w-3xl flex-col gap-5">
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
                {summary.productName} · {summary.qualityGradeName ?? "Không phân loại"}: Đã giao đủ
              </p>
            );
          }
          const proposed =
            props.quantities[summary.saleLineId] ?? String(summary.remaining.valueScaled / 1_000);
          return (
            <label key={summary.saleLineId} className="grid gap-2 border-b border-border py-3">
              <span>
                {summary.productName} · {summary.qualityGradeName ?? "Không phân loại"} · còn{" "}
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
        <label className="mt-3 grid gap-2">
          <span>Ảnh hoặc phiếu liên quan</span>
          <span className="text-caption text-ink-muted">
            Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; không tự tạo chuyển động
            kho.
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
      {props.feedback}
      <div className="flex flex-wrap gap-3">
        <Button disabled={!canSave} onClick={() => props.onSubmit("draft", false)}>
          {sending ? "Đang lưu…" : "Lưu để giao sau"}
        </Button>
        <Button
          tone="secondary"
          disabled={sending || !canDeliverAll}
          onClick={() => props.onSubmit("dispatch", props.onsiteCompletion)}
        >
          {sending
            ? "Đang xuất kho…"
            : props.onsiteCompletion
              ? "Xuất kho & giao tại chỗ"
              : "Xuất kho & bắt đầu giao"}
        </Button>
      </div>
    </div>
  );
}
