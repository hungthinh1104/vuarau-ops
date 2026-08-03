"use client";

import type { GoodsArrivalLineInput, QualityIssueCodeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export type InspectionFormProps = {
  readonly line: GoodsArrivalLineInput;
  readonly maxValueScaled: number;
  readonly issueCodes: readonly QualityIssueCodeDto[];
  readonly quantity: string;
  readonly issueId: string;
  readonly severity: "minor" | "moderate" | "severe";
  readonly issueNote: string;
  readonly note: string;
  readonly evidence: string;
  readonly valueScaled: number | null;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onQuantityChange: (value: string) => void;
  readonly onIssueChange: (value: string) => void;
  readonly onSeverityChange: (value: "minor" | "moderate" | "severe") => void;
  readonly onIssueNoteChange: (value: string) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onEvidenceChange: (value: string) => void;
  readonly onSubmit: () => void;
};

export function InspectionForm({
  line,
  maxValueScaled,
  issueCodes,
  quantity,
  issueId,
  severity,
  issueNote,
  note,
  evidence,
  valueScaled,
  locked,
  feedback,
  onQuantityChange,
  onIssueChange,
  onSeverityChange,
  onIssueNoteChange,
  onNoteChange,
  onEvidenceChange,
  onSubmit,
}: InspectionFormProps) {
  return (
    <details className="rounded-card border border-border p-3">
      <summary className="cursor-pointer text-label font-semibold">
        2. Ghi kết quả kiểm định
      </summary>
      <div className="mt-3 grid gap-3">
        <NumberInput
          label={`Lượng đã kiểm (${line.arrivedQuantity.unit}) · còn tối đa ${maxValueScaled / 1000}`}
          value={quantity}
          onChange={onQuantityChange}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Vấn đề phát hiện (không bắt buộc)"
            value={issueId}
            onChange={(event) => onIssueChange(event.target.value)}
            options={[
              { value: "", label: "Không ghi vấn đề" },
              ...issueCodes.map((issue) => ({
                value: issue.id,
                label: `${issue.code} · ${issue.displayName}`,
              })),
            ]}
          />
          <Select
            label="Mức độ"
            value={severity}
            disabled={issueId === ""}
            onChange={(event) =>
              onSeverityChange(event.target.value as "minor" | "moderate" | "severe")
            }
            options={[
              { value: "minor", label: "Nhẹ" },
              { value: "moderate", label: "Vừa" },
              { value: "severe", label: "Nặng" },
            ]}
          />
        </div>
        <label className="grid gap-2 text-label">
          Ghi chú vấn đề
          <Input
            value={issueNote}
            disabled={issueId === ""}
            onChange={(event) => onIssueNoteChange(event.target.value)}
          />
        </label>
        <label className="grid gap-2 text-label">
          Bằng chứng (mỗi đường dẫn cách nhau bằng dấu phẩy)
          <Input value={evidence} onChange={(event) => onEvidenceChange(event.target.value)} />
        </label>
        <label className="grid gap-2 text-label">
          Ghi chú kiểm định
          <TextareaControl value={note} onChange={(event) => onNoteChange(event.target.value)} />
        </label>
        <Button
          disabled={
            locked || valueScaled === null || valueScaled <= 0 || valueScaled > maxValueScaled
          }
          onClick={onSubmit}
        >
          {locked ? "Đang ghi kiểm định" : "Xác nhận kiểm định"}
        </Button>
        {feedback}
      </div>
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
