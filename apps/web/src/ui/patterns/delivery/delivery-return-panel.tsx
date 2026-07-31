"use client";

import type { DeliveryDto } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { formatQuantity } from "@/ui/format.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";

export type DeliveryReturnIntent = {
  readonly lines: readonly {
    readonly deliveryLineId: DeliveryDto["lines"][number]["deliveryLineId"];
    readonly quantity: DeliveryDto["lines"][number]["quantity"];
  }[];
  readonly reason: string;
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

  const parsedLines = lines.flatMap((line) => {
    const valueScaled = Math.round(Number(quantities[line.deliveryLineId] ?? "0") * 1000);
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
          <label
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
            <input
              className={INPUT_CLASS}
              inputMode="decimal"
              disabled={completed || locked}
              aria-label={`Số lượng trả ${line.productName}`}
              value={quantities[line.deliveryLineId] ?? ""}
              onChange={(event) =>
                setQuantities((current) => ({
                  ...current,
                  [line.deliveryLineId]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>
      <label className="grid gap-2 py-2">
        <span className="text-label">Lý do</span>
        <textarea
          className={INPUT_CLASS}
          disabled={completed || locked}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {completed ? (
        <Button tone="secondary" onClick={reset}>
          Ghi lần trả khác
        </Button>
      ) : (
        <Button
          disabled={!valid || locked}
          onClick={() => {
            if (!valid) return;
            onSubmit({ lines: parsedLines, reason: reason.trim() });
          }}
        >
          Ghi hàng trả
        </Button>
      )}
      {feedback}
    </section>
  );
}
