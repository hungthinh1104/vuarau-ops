"use client";

import type { QualityGradeDto, QualityGradeId, Unit } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";

export type InventoryReclassificationIntent = {
  readonly fromQualityGradeId: QualityGradeId;
  readonly fromQualityGradeName: string;
  readonly toQualityGradeId: QualityGradeId;
  readonly toQualityGradeName: string;
  readonly quantity: { readonly valueScaled: number; readonly unit: Unit };
  readonly reason: string;
};

export type InventoryReclassificationPanelProps = {
  readonly grades: readonly QualityGradeDto[];
  readonly completed: boolean;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onSubmit: (intent: InventoryReclassificationIntent) => void;
  readonly onStartAnother: () => void;
};

export function InventoryReclassificationPanel({
  grades,
  completed,
  locked,
  feedback,
  onSubmit,
  onStartAnother,
}: InventoryReclassificationPanelProps) {
  const [fromGradeId, setFromGradeId] = useState<QualityGradeId | null>(null);
  const [toGradeId, setToGradeId] = useState<QualityGradeId | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [reason, setReason] = useState("");
  const quantityScaled = Math.round(Number(quantity) * 1000);
  const fromGrade = grades.find((grade) => grade.id === fromGradeId);
  const toGrade = grades.find((grade) => grade.id === toGradeId);
  const valid =
    fromGrade !== undefined &&
    toGrade !== undefined &&
    fromGrade.id !== toGrade.id &&
    Number.isSafeInteger(quantityScaled) &&
    quantityScaled > 0 &&
    reason.trim().length > 0;

  function resetForm(): void {
    setFromGradeId(null);
    setToGradeId(null);
    setQuantity("");
    setUnit("kg");
    setReason("");
    onStartAnother();
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Chuyển phẩm cấp</h2>
      <p className="text-body-sm text-ink-muted">
        Ghi hai biến động bù trừ trong cùng giao dịch; tổng số lượng không đổi.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <Select
          label="Từ phẩm cấp"
          value={fromGradeId ?? ""}
          disabled={completed || locked}
          onChange={(event) => setFromGradeId(event.target.value as QualityGradeId)}
          placeholder="Chọn phẩm cấp nguồn"
          options={grades.map((grade) => ({ value: grade.id, label: grade.name }))}
        />
        <Select
          label="Sang phẩm cấp"
          value={toGradeId ?? ""}
          disabled={completed || locked}
          onChange={(event) => setToGradeId(event.target.value as QualityGradeId)}
          placeholder="Chọn phẩm cấp đích"
          options={grades.map((grade) => ({ value: grade.id, label: grade.name }))}
        />
        <label className="text-label">
          Số lượng
          <input
            className={INPUT_CLASS}
            inputMode="decimal"
            disabled={completed || locked}
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <Select
          label="Đơn vị"
          value={unit}
          disabled={completed || locked}
          onChange={(event) => setUnit(event.target.value as Unit)}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
        />
      </div>
      <label className="text-label">
        Lý do
        <textarea
          className={INPUT_CLASS}
          disabled={completed || locked}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {completed ? (
        <Button tone="secondary" onClick={resetForm}>
          Ghi chuyển phẩm cấp khác
        </Button>
      ) : (
        <Button
          disabled={!valid || locked}
          onClick={() => {
            if (fromGrade === undefined || toGrade === undefined || !valid) return;
            onSubmit({
              fromQualityGradeId: fromGrade.id,
              fromQualityGradeName: fromGrade.name,
              toQualityGradeId: toGrade.id,
              toQualityGradeName: toGrade.name,
              quantity: { valueScaled: quantityScaled, unit },
              reason: reason.trim(),
            });
          }}
        >
          Ghi chuyển phẩm cấp
        </Button>
      )}
      {feedback}
    </section>
  );
}
