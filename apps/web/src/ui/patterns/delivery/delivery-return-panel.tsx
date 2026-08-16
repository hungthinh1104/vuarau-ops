"use client";

import { UNIT_LABEL_VI, type DeliveryDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { parseSourceEvidence } from "@/ui/domain/source-evidence.ts";
import { formatQuantityInput, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { formatQuantity } from "@/ui/format.ts";
import { EvidenceReferenceInput } from "@/ui/patterns/evidence/evidence-reference-input.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export type DeliveryReturnIntent = {
  readonly lines: readonly {
    readonly deliveryLineId: DeliveryDto["lines"][number]["deliveryLineId"];
    readonly quantity: DeliveryDto["lines"][number]["quantity"];
  }[];
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
};

export type DeliveryReturnPanelProps = {
  readonly lines: DeliveryDto["lines"];
  readonly completed: boolean;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onSubmit: (intent: DeliveryReturnIntent) => void;
  readonly onStartAnother: () => void;
};

export function DeliveryReturnPanel({
  lines,
  completed,
  locked,
  feedback,
  onSubmit,
  onStartAnother,
}: DeliveryReturnPanelProps) {
  const [reason, setReason] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState("");

  const parsedLines = lines.flatMap((line) => {
    const parsed = parseQuantityText(quantities[line.deliveryLineId] ?? "0", line.quantity.unit);
    const valueScaled = parsed.ok && parsed.value !== null ? parsed.value.valueScaled : 0;
    return valueScaled > 0 && Number.isSafeInteger(valueScaled)
      ? [
          {
            deliveryLineId: line.deliveryLineId,
            quantity: { valueScaled, unit: line.quantity.unit },
          },
        ]
      : [];
  });
  const valid = parsedLines.length > 0 && reason.trim().length > 0;

  function reset(): void {
    setReason("");
    setQuantities({});
    setEvidence("");
    onStartAnother();
  }

  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="font-semibold">Ghi nhận hàng trả</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Hàng trả tạo biến động nhập kho bù trừ; không tự thay đổi công nợ khách hàng.
      </p>
      <div className="mt-3 divide-y divide-border">
        {lines.map((line) => (
          <div
            key={line.deliveryLineId}
            className="grid gap-2 py-3 md:grid-cols-[1fr_12rem] md:items-center"
          >
            <span>
              <strong>{line.productName}</strong>
              <span className="block text-caption text-ink-muted">
                {line.qualityGradeName ?? "Chưa phân loại (lịch sử)"} · đã giao{" "}
                {formatQuantity(line.quantity)}
              </span>
            </span>
            <div className="flex flex-col gap-1">
              <QuantityInput
                label={`Số lượng trả ${line.productName}`}
                unit={line.quantity.unit}
                unitLabel={UNIT_LABEL_VI[line.quantity.unit]}
                disabled={completed || locked}
                value={quantities[line.deliveryLineId] ?? ""}
                onChange={(event) =>
                  setQuantities((current) => ({
                    ...current,
                    [line.deliveryLineId]: event.target.value,
                  }))
                }
              />
              <Button
                tone="link"
                disabled={completed || locked}
                onClick={() =>
                  setQuantities((current) => ({
                    ...current,
                    [line.deliveryLineId]: formatQuantityInput(line.quantity),
                  }))
                }
                className="self-end text-caption font-medium text-info"
              >
                Trả đủ ({formatQuantity(line.quantity)})
              </Button>
            </div>
          </div>
        ))}
      </div>
      <label className="grid gap-2 py-2">
        <span className="text-label">Lý do</span>
        <TextareaControl
          disabled={completed || locked}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <EvidenceReferenceInput
        value={evidence}
        disabled={completed || locked}
        onChange={setEvidence}
        hint="Mỗi dòng một tham chiếu; chỉ lưu nguồn đối chiếu, không tự suy ra hoàn tiền hay giảm nợ."
      />
      {completed ? (
        <Button tone="secondary" onClick={reset}>
          Ghi lần trả khác
        </Button>
      ) : (
        <Button
          disabled={!valid || locked}
          onClick={() => {
            if (!valid) return;
            onSubmit({
              lines: parsedLines,
              reason: reason.trim(),
              evidenceReferences: parseSourceEvidence(evidence),
            });
          }}
        >
          Ghi hàng trả
        </Button>
      )}
      {feedback}
    </section>
  );
}
