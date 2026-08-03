"use client";

import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type {
  PurchaseDraftLine,
  PurchaseProductOption,
  PurchaseSupplierOption,
} from "@/ui/domain/purchase-form.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PurchaseDraftForm } from "@/ui/patterns/purchase/purchase-draft-form.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export function PurchaseCreatePermissionView() {
  return <p role="alert">Bạn không có quyền tạo đơn mua.</p>;
}

export function PurchaseCreateView(props: {
  readonly supplierId: string;
  readonly suppliers: readonly PurchaseSupplierOption[];
  readonly lines: readonly PurchaseDraftLine[];
  readonly products: readonly PurchaseProductOption[];
  readonly note: string;
  readonly evidence: string;
  readonly valid: boolean;
  readonly submitting: boolean;
  readonly createCommand: CommandOutcomeView;
  readonly confirmCommand: CommandOutcomeView;
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
  readonly onSave: (confirm: boolean) => void;
}) {
  return (
    <PurchaseDraftForm
      title="Tạo đơn mua"
      back={{ href: "/purchases", label: "Đơn mua" }}
      supplierId={props.supplierId}
      suppliers={props.suppliers}
      lines={props.lines}
      products={props.products}
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
      onSubmit={() => props.onSave(false)}
      feedback={
        <>
          <CommandOutcome
            command={props.createCommand}
            attemptedAction="Lưu đơn mua"
            onReload={() => undefined}
          />
          {props.canConfirm ? (
            <>
              <Button
                disabled={!props.valid || props.submitting}
                onClick={() => props.onSave(true)}
              >
                Xác nhận đơn mua
              </Button>
              <CommandOutcome
                command={props.confirmCommand}
                attemptedAction="Xác nhận đơn mua"
                onReload={() => undefined}
              />
            </>
          ) : null}
        </>
      }
    />
  );
}
