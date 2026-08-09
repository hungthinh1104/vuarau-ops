"use client";

import { UNIT_LABEL_VI, type PurchaseDto, type QualityGradeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatQuantity } from "@/ui/format.ts";
import { formatQuantityInput, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { EvidenceReferenceInput } from "@/ui/patterns/evidence/evidence-reference-input.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";

export type ReceivingCaptureIntentLine = {
  readonly purchaseLineId: PurchaseDto["lines"][number]["lineId"];
  readonly productId: PurchaseDto["lines"][number]["productId"];
  readonly qualityGradeId: QualityGradeDto["id"] | null;
  readonly qualityGradeName: string | null;
  readonly quantity: {
    readonly valueScaled: number;
    readonly unit: PurchaseDto["lines"][number]["quantity"]["unit"];
  };
};

export type ReceivingCapturePanelProps = {
  readonly purchase: PurchaseDto;
  readonly grades: readonly QualityGradeDto[];
  readonly gradesLoading: boolean;
  readonly qualityGradeRequired?: boolean;
  readonly remainingByLine?: Readonly<Record<string, number>>;
  readonly quantities: Readonly<Record<string, string>>;
  readonly evidence?: string;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onQuantityChange: (key: string, value: string) => void;
  readonly onEvidenceChange?: (value: string) => void;
  readonly onSubmit: (lines: readonly ReceivingCaptureIntentLine[]) => void;
};

export function ReceivingCapturePanel({
  purchase,
  grades,
  gradesLoading,
  qualityGradeRequired = true,
  remainingByLine = {},
  quantities,
  evidence = "",
  locked,
  feedback,
  onQuantityChange,
  onEvidenceChange = () => undefined,
  onSubmit,
}: ReceivingCapturePanelProps) {
  const [splitByGrade, setSplitByGrade] = useState(false);
  const [hasIssue, setHasIssue] = useState(false);
  const lines = purchase.lines.flatMap<ReceivingCaptureIntentLine>((line) => {
    if (!splitByGrade) {
      const key = `${line.lineId}:ungraded`;
      const defaultQuantity = formatQuantityInput({
        valueScaled: remainingByLine[line.lineId] ?? line.quantity.valueScaled,
        unit: line.quantity.unit,
      });
      const parsed = parseQuantityText(quantities[key] ?? defaultQuantity, line.quantity.unit);
      const valueScaled = parsed.ok && parsed.value !== null ? parsed.value.valueScaled : 0;
      if (valueScaled <= 0 || !Number.isSafeInteger(valueScaled)) return [];
      return [
        {
          purchaseLineId: line.lineId,
          productId: line.productId,
          qualityGradeId: null,
          qualityGradeName: null,
          quantity: { valueScaled, unit: line.quantity.unit },
        } satisfies ReceivingCaptureIntentLine,
      ];
    }
    return grades.flatMap((grade) => {
      const key = `${line.lineId}:${grade.id}`;
      const parsed = parseQuantityText(quantities[key] ?? "0", line.quantity.unit);
      const valueScaled = parsed.ok && parsed.value !== null ? parsed.value.valueScaled : 0;
      if (valueScaled <= 0 || !Number.isSafeInteger(valueScaled)) return [];
      return [
        {
          purchaseLineId: line.lineId,
          productId: line.productId,
          qualityGradeId: grade.id,
          qualityGradeName: grade.name,
          quantity: { valueScaled, unit: line.quantity.unit },
        } satisfies ReceivingCaptureIntentLine,
      ];
    });
  });

  const canSubmit = lines.length > 0 && !locked && (!qualityGradeRequired || splitByGrade);

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Ghi nhận hàng vào kho</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Ghi số lượng thực nhận. Hàng đạt sẽ vào tồn kho; hàng không đạt được xử lý riêng để không
        làm sai số tồn.
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          tone="secondary"
          disabled={locked}
          onClick={() => {
            for (const line of purchase.lines) {
              const remaining = formatQuantityInput({
                valueScaled: remainingByLine[line.lineId] ?? line.quantity.valueScaled,
                unit: line.quantity.unit,
              });
              if (splitByGrade && grades[0] !== undefined) {
                onQuantityChange(`${line.lineId}:${grades[0].id}`, remaining);
                for (const grade of grades.slice(1)) {
                  onQuantityChange(`${line.lineId}:${grade.id}`, "0");
                }
              } else {
                onQuantityChange(`${line.lineId}:ungraded`, remaining);
              }
            }
          }}
        >
          Nhận đủ số còn lại
        </Button>
        {grades.length > 0 ? (
          <Button
            tone="secondary"
            disabled={locked || grades.length === 0}
            onClick={() => setSplitByGrade((current) => !current)}
          >
            {splitByGrade ? "Gộp về một dòng" : "Chia theo hạng"}
          </Button>
        ) : null}
        <Button
          tone="secondary"
          disabled={locked}
          onClick={() => setHasIssue((current) => !current)}
        >
          {hasIssue ? "Ẩn hàng lỗi" : "Có hàng lỗi"}
        </Button>
      </div>
      {hasIssue ? (
        <p className="rounded-input bg-warning-soft p-3 text-body-sm text-ink-muted">
          Hãy ghi riêng số hàng tạm giữ hoặc trả nhà cung cấp trong màn hình kiểm hàng để số nhập
          kho chỉ gồm hàng đạt.
        </p>
      ) : null}

      <div className="mt-4 grid gap-4">
        {purchase.lines.map((line) => (
          <fieldset
            key={line.lineId}
            className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <legend className="px-1 text-label font-semibold">
              {line.productName} · đặt {formatQuantity(line.quantity)}
            </legend>
            {splitByGrade
              ? grades.map((grade, index) => {
                  const key = `${line.lineId}:${grade.id}`;
                  return (
                    <QuantityInput
                      key={key}
                      label={grade.name}
                      aria-label={`${line.productName} · ${grade.name}`}
                      unit={line.quantity.unit}
                      unitLabel={UNIT_LABEL_VI[line.quantity.unit]}
                      disabled={locked}
                      value={
                        (quantities[key] ?? index === 0)
                          ? formatQuantityInput({
                              valueScaled:
                                remainingByLine[line.lineId] ?? line.quantity.valueScaled,
                              unit: line.quantity.unit,
                            })
                          : "0"
                      }
                      onChange={(event) => onQuantityChange(key, event.target.value)}
                    />
                  );
                })
              : (() => {
                  const key = `${line.lineId}:ungraded`;
                  return (
                    <QuantityInput
                      label={splitByGrade ? "Chưa chọn hạng" : "Số lượng thực nhận"}
                      aria-label={`${line.productName} · ${splitByGrade ? "Chưa chọn hạng" : "Không phân loại"}`}
                      unit={line.quantity.unit}
                      unitLabel={UNIT_LABEL_VI[line.quantity.unit]}
                      disabled={locked}
                      value={
                        quantities[key] ??
                        formatQuantityInput({
                          valueScaled: remainingByLine[line.lineId] ?? line.quantity.valueScaled,
                          unit: line.quantity.unit,
                        })
                      }
                      onChange={(event) => onQuantityChange(key, event.target.value)}
                    />
                  );
                })()}
          </fieldset>
        ))}
      </div>

      <div className="mt-4">
        <EvidenceReferenceInput
          value={evidence}
          disabled={locked}
          onChange={onEvidenceChange}
          hint="Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; không tự tạo hậu quả tiền hay hàng."
        />
      </div>

      {qualityGradeRequired && gradesLoading ? (
        <p className="mt-3 text-body-sm text-ink-muted">Đang tải hạng hàng…</p>
      ) : qualityGradeRequired && grades.length === 0 ? (
        <p role="alert" className="mt-3 text-body-sm text-warning">
          Chưa có hạng hàng đang dùng. Hãy thêm hạng hàng trước khi chia số lượng.
        </p>
      ) : null}

      <Button className="mt-4" disabled={!canSubmit} onClick={() => onSubmit(lines)}>
        {locked ? "Đang ghi phiếu nhập kho" : "Ghi phiếu nhập kho"}
      </Button>
      {feedback}
    </section>
  );
}
