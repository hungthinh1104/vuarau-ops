"use client";

import type {
  GoodsArrivalLineInput,
  QualityDispositionSource,
  QualityGradeDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

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
  const acceptedValue = Number(values.accepted) * 1000;
  const canSubmit = !locked && total > 0 && total <= eligibleValueScaled && !gradeMissing;

  return (
    <details open className="rounded-card border border-leaf/40 p-3">
      <summary className="cursor-pointer text-label font-semibold">{title}</summary>
      <p className="mt-2 text-caption text-ink-muted">
        Có thể phân bổ tối đa {eligibleValueScaled / 1000} {unit}. Chỉ lượng chấp nhận mới tạo tồn
        kho.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <NumberInput
          label={`Chấp nhận (${unit})`}
          value={values.accepted}
          onChange={(value) => onValueChange("accepted", value)}
        />
        {allowQuarantine ? (
          <NumberInput
            label={`Cách ly (${unit})`}
            value={values.quarantined}
            onChange={(value) => onValueChange("quarantined", value)}
          />
        ) : null}
        <NumberInput
          label={`Từ chối (${unit})`}
          value={values.rejected}
          onChange={(value) => onValueChange("rejected", value)}
        />
        <NumberInput
          label={`Hủy bỏ (${unit})`}
          value={values.disposed}
          onChange={(value) => onValueChange("disposed", value)}
        />
      </div>
      {acceptedValue > 0 ? (
        <Select
          label={`Phẩm cấp cho lượng chấp nhận ${gradeRequired ? "(bắt buộc)" : "(không bắt buộc)"}`}
          value={gradeId}
          onChange={(event) => onGradeChange(event.target.value)}
          options={[
            { value: "", label: "Không gán phẩm cấp" },
            ...grades.map((grade) => ({ value: grade.id, label: grade.name })),
          ]}
        />
      ) : null}
      <label className="mt-3 grid gap-2 text-label">
        Ghi chú quyết định
        <TextareaControl value={note} onChange={(event) => onNoteChange(event.target.value)} />
      </label>
      <Textarea
        className="mt-3"
        label="Nguồn chứng cứ vận hành"
        value={evidence}
        disabled={locked}
        onChange={(event) => onEvidenceChange(event.target.value)}
        hint="Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; không tự tạo hậu quả ngoài quyết định đã ghi."
      />
      {total > eligibleValueScaled ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Tổng phân bổ vượt lượng có thể quyết định.
        </p>
      ) : gradeMissing ? (
        <p role="alert" className="mt-2 text-caption text-danger">
          Vựa đang bắt buộc phẩm cấp cho lượng nhập kho.
        </p>
      ) : null}
      <Button className="mt-3" disabled={!canSubmit} onClick={onSubmit}>
        {locked ? "Đang ghi quyết định" : "Xác nhận quyết định"}
      </Button>
      {feedback}
    </details>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-2 text-label">
      {label}
      <Input inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
