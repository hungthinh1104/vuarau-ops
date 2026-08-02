"use client";

import type { PurchaseDto } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { PurchaseDraftLine, PurchaseProductOption } from "@/ui/domain/purchase-form.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PurchaseDraftForm } from "@/ui/patterns/purchase/purchase-draft-form.tsx";

export function PurchaseEditPermissionView() {
  return <p role="alert">Bạn không có quyền sửa đơn mua.</p>;
}

export function PurchaseEditStateView() {
  return <p role="alert">Chỉ đơn mua nháp mới có thể sửa.</p>;
}

export function PurchaseEditView(props: {
  readonly purchase: PurchaseDto;
  readonly products: readonly PurchaseProductOption[];
  readonly productsLoading: boolean;
  readonly lines: readonly PurchaseDraftLine[];
  readonly note: string;
  readonly valid: boolean;
  readonly command: CommandOutcomeView;
  readonly onLineChange: (
    lineId: PurchaseDraftLine["lineId"],
    patch: Partial<PurchaseDraftLine>,
  ) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (lineId: PurchaseDraftLine["lineId"]) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  return (
    <PurchaseDraftForm
      title="Sửa đơn mua nháp"
      description="Nhà cung cấp không đổi trong lần sửa này. Tạo đơn khác nếu chọn sai nhà cung cấp."
      back={{ href: `/purchases/${props.purchase.id}`, label: "Chi tiết đơn mua" }}
      supplierId={props.purchase.supplierId}
      supplierDisabled
      lines={props.lines}
      products={props.products}
      productsLoading={props.productsLoading}
      note={props.note}
      valid={props.valid}
      submitting={props.command.phase.kind === "sending"}
      submitLabel="Lưu thay đổi"
      addLineDisabled={props.products.length === 0}
      onLineChange={props.onLineChange}
      onAddLine={props.onAddLine}
      onRemoveLine={props.onRemoveLine}
      onNoteChange={props.onNoteChange}
      onSubmit={props.onSubmit}
      feedback={
        <CommandOutcome
          command={props.command}
          attemptedAction="Sửa đơn mua"
          onReload={props.onReload}
        />
      }
    />
  );
}
