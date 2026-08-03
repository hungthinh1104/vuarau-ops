"use client";

import type { PurchaseDto, QualityGradeDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { formatQuantity } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";

export type ReceivingCaptureIntentLine = {
  readonly purchaseLineId: PurchaseDto["lines"][number]["lineId"];
  readonly productId: PurchaseDto["lines"][number]["productId"];
  readonly qualityGradeId: QualityGradeDto["id"];
  readonly qualityGradeName: string;
  readonly quantity: {
    readonly valueScaled: number;
    readonly unit: PurchaseDto["lines"][number]["quantity"]["unit"];
  };
};

export type ReceivingCapturePanelProps = {
  readonly purchase: PurchaseDto;
  readonly grades: readonly QualityGradeDto[];
  readonly gradesLoading: boolean;
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
  quantities,
  evidence = "",
  locked,
  feedback,
  onQuantityChange,
  onEvidenceChange = () => undefined,
  onSubmit,
}: ReceivingCapturePanelProps) {
  const lines = purchase.lines.flatMap((line) =>
    grades.flatMap((grade) => {
      const key = `${line.lineId}:${grade.id}`;
      const valueScaled = Math.round(Number(quantities[key] ?? "0") * 1000);
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
    }),
  );

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Ghi nhận hàng vào kho</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Phiếu nhận hiện có nghĩa là lượng hàng đã được chấp nhận vào tồn kho. Nếu hàng vừa tới bị từ
        chối, cần giữ riêng và không ghi như hàng đã nhận chỉ để khớp phần mềm; semantics hàng hư/từ
        chối đang chờ ASM-033.
      </p>

      <div className="mt-4 grid gap-4">
        {purchase.lines.map((line) => (
          <fieldset
            key={line.lineId}
            className="grid gap-2 border-t border-border pt-3 first:border-t-0 first:pt-0"
          >
            <legend className="px-1 text-label font-semibold">
              {line.productName} · đặt {formatQuantity(line.quantity)}
            </legend>
            {grades.map((grade) => {
              const key = `${line.lineId}:${grade.id}`;
              return (
                <label
                  key={key}
                  className="grid gap-1 text-label sm:grid-cols-[1fr_10rem] sm:items-center"
                >
                  <span>{grade.name}</span>
                  <Input
                    inputMode="decimal"
                    disabled={locked}
                    aria-label={`${line.productName} · ${grade.name}`}
                    value={quantities[key] ?? ""}
                    onChange={(event) => onQuantityChange(key, event.target.value)}
                  />
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>

      <Textarea
        className="mt-4"
        label="Nguồn chứng cứ vận hành"
        value={evidence}
        disabled={locked}
        onChange={(event) => onEvidenceChange(event.target.value)}
        hint="Mỗi dòng một tham chiếu tới phiếu, ảnh, tin nhắn hoặc biên bản; không tự tạo hậu quả tiền hay hàng."
      />

      {gradesLoading ? (
        <p className="mt-3 text-body-sm text-ink-muted">Đang tải phẩm cấp…</p>
      ) : grades.length === 0 ? (
        <p role="alert" className="mt-3 text-body-sm text-warning">
          Chưa có phẩm cấp đang dùng. Theo chính sách hiện tại chưa thể ghi lượng nhận mới.
        </p>
      ) : null}

      <Button
        className="mt-4"
        disabled={lines.length === 0 || locked}
        onClick={() => onSubmit(lines)}
      >
        {locked ? "Đang xác nhận phiếu nhận" : "Ghi phiếu nhận hàng"}
      </Button>
      {feedback}
    </section>
  );
}
