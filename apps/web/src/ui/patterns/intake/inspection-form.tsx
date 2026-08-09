"use client";

import {
  UNIT_LABEL_VI,
  type GoodsArrivalLineInput,
  type QualityIssueCodeDto,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatQuantity } from "@/ui/format.ts";
import { EvidenceReferenceInput } from "@/ui/patterns/evidence/evidence-reference-input.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
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
      <summary className="cursor-pointer text-label font-semibold">1. Kiểm hàng</summary>
      <div className="mt-3 grid gap-3">
        <QuantityInput
          label={`Số lượng đã kiểm · còn tối đa ${formatQuantity({ valueScaled: maxValueScaled, unit: line.arrivedQuantity.unit })}`}
          unit={line.arrivedQuantity.unit}
          unitLabel={UNIT_LABEL_VI[line.arrivedQuantity.unit]}
          value={quantity}
          onChange={(event) => onQuantityChange(event.target.value)}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Lý do hàng không đạt (không bắt buộc)"
            value={issueId}
            onChange={(event) => onIssueChange(event.target.value)}
            options={[
              { value: "", label: "Không ghi vấn đề" },
              ...issueCodes.map((issue) => ({
                value: issue.id,
                label: issue.displayName,
              })),
            ]}
          />
          <Select
            label="Mức độ ảnh hưởng"
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
          Ghi chú hàng không đạt
          <Input
            value={issueNote}
            disabled={issueId === ""}
            onChange={(event) => onIssueNoteChange(event.target.value)}
          />
        </label>
        <EvidenceReferenceInput value={evidence} onChange={onEvidenceChange} />
        <label className="grid gap-2 text-label">
          Ghi chú kiểm hàng
          <TextareaControl value={note} onChange={(event) => onNoteChange(event.target.value)} />
        </label>
        <Button
          disabled={
            locked || valueScaled === null || valueScaled <= 0 || valueScaled > maxValueScaled
          }
          onClick={onSubmit}
        >
          {locked ? "Đang ghi kiểm hàng" : "Xác nhận đã kiểm hàng"}
        </Button>
        {feedback}
      </div>
    </details>
  );
}
