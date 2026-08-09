"use client";

import type {
  GoodsArrivalLineInput,
  QualityDispositionSource,
  QualityGradeDto,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { formatQuantity } from "@/ui/format.ts";
import { EvidenceReferenceInput } from "@/ui/patterns/evidence/evidence-reference-input.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export type DispositionValues = {
  readonly accepted: string;
  readonly quarantined: string;
  readonly rejected: string;
  readonly disposed: string;
};

export type DispositionValueKey = keyof DispositionValues;

export type DispositionFormProps = {
  readonly source: QualityDispositionSource;
  readonly unit: GoodsArrivalLineInput["arrivedQuantity"]["unit"];
  readonly eligibleValueScaled: number;
  readonly gradeRequired: boolean;
  readonly allowQuarantine: boolean;
  readonly title: string;
  readonly grades: readonly QualityGradeDto[];
  readonly values: DispositionValues;
  readonly gradeId: string;
  readonly note: string;
  readonly evidence: string;
  readonly total: number;
  readonly gradeMissing: boolean;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onValueChange: (key: DispositionValueKey, value: string) => void;
  readonly onGradeChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onEvidenceChange: (value: string) => void;
  readonly onSubmit: () => void;
};

export function DispositionForm({
  title,
  unit,
  eligibleValueScaled,
  gradeRequired,
  allowQuarantine,
  grades,
  values,
  gradeId,
  note,
  evidence,
  total,
  gradeMissing,
  locked,
  feedback,
  onValueChange,
  onGradeChange,
  onNoteChange,
  onEvidenceChange,
  onSubmit,
}: DispositionFormProps) {
  const [showIssueFields, setShowIssueFields] = useState(false);
  const [showGrade, setShowGrade] = useState(false);
  const accepted = parseQuantityText(values.accepted, unit);
  const acceptedValue = accepted.ok && accepted.value !== null ? accepted.value.valueScaled : 0;
  const canSubmit = !locked && total > 0 && total <= eligibleValueScaled && !gradeMissing;

  return (
    <details open className="rounded-card border border-leaf/40 p-3">
      <summary className="cursor-pointer text-label font-semibold">{title}</summary>
      <p className="mt-2 text-caption text-ink-muted">
        Có thể phân bổ tối đa {formatQuantity({ valueScaled: eligibleValueScaled, unit })}. Chỉ
        lượng chấp nhận mới tạo tồn kho.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <QuantityInput
          label={`Đạt (${unit})`}
          unit={unit}
          unitLabel={UNIT_LABEL_VI[unit]}
          value={values.accepted}
          onChange={(event) => onValueChange("accepted", event.target.value)}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button tone="secondary" type="button" onClick={() => setShowGrade((current) => !current)}>
          {showGrade ? "Ẩn hạng hàng" : "Chia theo hạng"}
        </Button>
        <Button
          tone="secondary"
          type="button"
          onClick={() => setShowIssueFields((current) => !current)}
        >
          {showIssueFields ? "Ẩn hàng lỗi" : "Có hàng lỗi"}
        </Button>
      </div>
      {showIssueFields ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {allowQuarantine ? (
            <QuantityInput
              label={`Tạm giữ (${unit})`}
              unit={unit}
              unitLabel={UNIT_LABEL_VI[unit]}
              value={values.quarantined}
              onChange={(event) => onValueChange("quarantined", event.target.value)}
            />
          ) : null}
          <QuantityInput
            label={`Trả nhà cung cấp (${unit})`}
            unit={unit}
            unitLabel={UNIT_LABEL_VI[unit]}
            value={values.rejected}
            onChange={(event) => onValueChange("rejected", event.target.value)}
          />
          <QuantityInput
            label={`Loại bỏ (${unit})`}
            unit={unit}
            unitLabel={UNIT_LABEL_VI[unit]}
            value={values.disposed}
            onChange={(event) => onValueChange("disposed", event.target.value)}
          />
        </div>
      ) : null}
      {acceptedValue > 0 && showGrade ? (
        <Select
          label={`Hạng hàng cho phần đạt ${gradeRequired ? "(bắt buộc)" : "(không bắt buộc)"}`}
          value={gradeId}
          onChange={(event) => onGradeChange(event.target.value)}
          options={[
            { value: "", label: "Chưa chọn hạng hàng" },
            ...grades.map((grade) => ({ value: grade.id, label: grade.name })),
          ]}
        />
      ) : null}
      <label className="mt-3 grid gap-2 text-label">
        Ghi chú quyết định
        <TextareaControl value={note} onChange={(event) => onNoteChange(event.target.value)} />
      </label>
      <div className="mt-3">
        <EvidenceReferenceInput value={evidence} disabled={locked} onChange={onEvidenceChange} />
      </div>
      {total > eligibleValueScaled ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Tổng phân bổ vượt lượng có thể quyết định.
        </p>
      ) : gradeMissing ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Vựa đang yêu cầu chọn hạng hàng cho phần đạt.
        </p>
      ) : null}
      <Button className="mt-3" disabled={!canSubmit} onClick={onSubmit}>
        {locked ? "Đang lưu kết quả" : "Lưu kết quả kiểm hàng"}
      </Button>
      {feedback}
    </details>
  );
}
