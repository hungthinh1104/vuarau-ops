"use client";

import type { QualityGradeDto, QualityGradeId, Unit } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

type InventoryAdjustmentReasonCode =
  "opening_balance" | "count_correction" | "spoilage" | "shrinkage" | "other";

export type InventoryAdjustmentIntent = {
  readonly qualityGradeId: QualityGradeId;
  readonly qualityGradeName: string;
  readonly quantity: { readonly valueScaled: number; readonly unit: Unit };
  readonly direction: "increase" | "decrease";
  readonly reasonCode: InventoryAdjustmentReasonCode;
  readonly reason: string;
};

export type InventoryAdjustmentPanelProps = {
  readonly grades: readonly QualityGradeDto[];
  readonly completed: boolean;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onSubmit: (intent: InventoryAdjustmentIntent) => void;
  readonly onStartAnother: () => void;
};

export function InventoryAdjustmentPanel({
  grades,
  completed,
  locked,
  feedback,
  onSubmit,
  onStartAnother,
}: InventoryAdjustmentPanelProps) {
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | null>(null);
  const [reasonCode, setReasonCode] = useState<InventoryAdjustmentReasonCode>("count_correction");
  const [reason, setReason] = useState("");
  const quantityScaled = Math.round(Number(quantity) * 1000);
  const grade = grades.find((candidate) => candidate.id === qualityGradeId);
  const valid =
    grade !== undefined &&
    Number.isSafeInteger(quantityScaled) &&
    quantityScaled > 0 &&
    reason.trim().length > 0;

  function resetForm(): void {
    setDirection("increase");
    setQuantity("");
    setUnit("kg");
    setQualityGradeId(null);
    setReasonCode("count_correction");
    setReason("");
    onStartAnother();
  }

  return (
    <section
      aria-labelledby="inventory-adjustment-title"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="inventory-adjustment-title" className="text-subheading font-semibold">
        Điều chỉnh tồn kho
      </h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Chỉ dùng cho số dư đầu kỳ, kiểm đếm, hư hỏng, hao hụt hoặc fact vật lý không có chứng từ
        nguồn tốt hơn. Điều chỉnh này chỉ đổi tồn kho; không dùng để giả lập trả nhà cung cấp, hoàn
        tác phiếu nhận hay giảm công nợ. Supplier return còn chờ ASM-038.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <Select
          label="Hướng"
          value={direction}
          disabled={completed || locked}
          onChange={(event) => setDirection(event.target.value as typeof direction)}
          options={[
            { value: "increase", label: "Tăng" },
            { value: "decrease", label: "Giảm" },
          ]}
        />
        <TextInput
          label="Số lượng"
          inputMode="decimal"
          disabled={completed || locked}
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
        />
        <Select
          label="Đơn vị"
          value={unit}
          disabled={completed || locked}
          onChange={(event) => setUnit(event.target.value as Unit)}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
        />
      </div>
      <Select
        label="Phẩm cấp"
        value={qualityGradeId ?? ""}
        disabled={completed || locked}
        onChange={(event) => setQualityGradeId(event.target.value as QualityGradeId)}
        placeholder="Chọn phẩm cấp"
        options={grades.map((item) => ({ value: item.id, label: item.name }))}
      />
      <Select
        label="Lý do"
        value={reasonCode}
        disabled={completed || locked}
        onChange={(event) => setReasonCode(event.target.value as InventoryAdjustmentReasonCode)}
        options={[
          { value: "opening_balance", label: "Số dư đầu kỳ" },
          { value: "count_correction", label: "Kiểm đếm" },
          { value: "spoilage", label: "Hư hỏng" },
          { value: "shrinkage", label: "Hao hụt" },
          { value: "other", label: "Khác" },
        ]}
      />
      <Textarea
        label="Giải thích"
        disabled={completed || locked}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
      />
      {completed ? (
        <Button tone="secondary" onClick={resetForm}>
          Ghi điều chỉnh khác
        </Button>
      ) : (
        <Button
          disabled={!valid || locked}
          onClick={() => {
            if (grade === undefined || !valid) return;
            onSubmit({
              qualityGradeId: grade.id,
              qualityGradeName: grade.name,
              quantity: { valueScaled: quantityScaled, unit },
              direction,
              reasonCode,
              reason: reason.trim(),
            });
          }}
        >
          Ghi điều chỉnh
        </Button>
      )}
      {feedback}
    </section>
  );
}
