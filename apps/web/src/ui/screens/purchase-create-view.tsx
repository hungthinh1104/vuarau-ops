"use client";

import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type {
  PurchaseDraftLine,
  PurchaseProductOption,
  PurchaseSupplierOption,
} from "@/ui/domain/purchase-form.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PartialCompletion } from "@/ui/patterns/feedback/partial-completion.tsx";
import { PurchaseDraftForm } from "@/ui/patterns/purchase/purchase-draft-form.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export function PurchaseCreatePermissionView() {
  return <p role="alert">Bạn không có quyền tạo đơn mua.</p>;
}

export function PurchaseCreateView(props: {
  readonly supplierId: string;
  readonly suppliers: readonly PurchaseSupplierOption[];
  readonly supplierSearch: {
    readonly value: string;
    readonly onChange: (value: string) => void;
  };
  readonly lines: readonly PurchaseDraftLine[];
  readonly products: readonly PurchaseProductOption[];
  readonly productSearch: {
    readonly value: string;
    readonly onChange: (value: string) => void;
  };
  readonly note: string;
  readonly evidence: string;
  readonly valid: boolean;
  readonly submitting: boolean;
  readonly createCommand: CommandOutcomeView;
  readonly confirmCommand: CommandOutcomeView;
  readonly receiptCommand: CommandOutcomeView;
  readonly qualityGradeRequired: boolean;
  readonly partialCompletion: { readonly href: string; readonly message: string } | null;
  readonly canConfirm: boolean;
  readonly onSupplierChange: (supplierId: string) => void;
  readonly onLineChange: (
    lineId: PurchaseDraftLine["lineId"],
    patch: Partial<PurchaseDraftLine>,
  ) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (lineId: PurchaseDraftLine["lineId"]) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onEvidenceChange: (evidence: string) => void;
  readonly onSave: (action: "draft" | "receive" | "another") => void;
}) {
  return (
    <PurchaseDraftForm
      title="Tạo đơn mua"
      back={{ href: "/purchases", label: "Đơn mua" }}
      supplierId={props.supplierId}
      suppliers={props.suppliers}
      supplierSearch={props.supplierSearch}
      lines={props.lines}
      products={props.products}
      productSearch={props.productSearch}
      note={props.note}
      evidence={props.evidence}
      valid={props.valid}
      submitting={props.submitting}
      submitLabel="Lưu nháp"
      onSupplierChange={props.onSupplierChange}
      onLineChange={props.onLineChange}
      onAddLine={props.onAddLine}
      onRemoveLine={props.onRemoveLine}
      onNoteChange={props.onNoteChange}
      onEvidenceChange={props.onEvidenceChange}
      onSubmit={() => props.onSave("draft")}
      actionButtons={
        props.canConfirm ? (
          <>
            <Button
              disabled={!props.valid || props.submitting}
              onClick={() => props.onSave("receive")}
            >
              {props.submitting
                ? "Đang lưu và nhận…"
                : props.qualityGradeRequired
                  ? "Lưu và mở nhận hàng"
                  : "Lưu và nhận hàng"}
            </Button>
            <Button
              tone="secondary"
              disabled={!props.valid || props.submitting}
              onClick={() => props.onSave("another")}
            >
              {props.submitting ? "Đang lưu…" : "Lưu và tạo tiếp"}
            </Button>
          </>
        ) : null
      }
      feedback={
        <>
          <CommandOutcome
            command={props.createCommand}
            attemptedAction="Lưu đơn mua"
            suppressSuccessToast
            onReload={() => undefined}
          />
          <CommandOutcome
            command={props.confirmCommand}
            attemptedAction="Xác nhận đơn mua"
            suppressSuccessToast
            onReload={() => undefined}
          />
          <CommandOutcome
            command={props.receiptCommand}
            attemptedAction="Ghi nhận hàng"
            suppressSuccessToast
            onReload={() => undefined}
          />
          {props.partialCompletion === null ? null : (
            <PartialCompletion
              href={props.partialCompletion.href}
              message={props.partialCompletion.message}
            />
          )}
        </>
      }
    />
  );
}
