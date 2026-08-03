"use client";

import type { StocktakeDto, QualityGradeDto, QualityGradeId, Unit } from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useState } from "react";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

export type InventoryStocktakePanelProps = {
  readonly productId: string;
  readonly grades: readonly QualityGradeDto[];
  readonly session: StocktakeDto | null;
  readonly locked: boolean;
  readonly feedback?: ReactNode;
  readonly onStart: (input: {
    readonly scopeReference: string;
    readonly note: string | null;
  }) => void;
  readonly onCount: (input: {
    readonly qualityGradeId: QualityGradeId | null;
    readonly qualityGradeName: string | null;
    readonly quantity: { readonly valueScaled: number; readonly unit: Unit };
  }) => void;
  readonly onApprove: (reason: string) => void;
};

export function InventoryStocktakePanel({
  productId,
  grades,
  session,
  locked,
  feedback,
  onStart,
  onCount,
  onApprove,
}: InventoryStocktakePanelProps) {
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | null>(null);
  const [reason, setReason] = useState("");
  const quantityScaled = Math.round(Number(quantity) * 1000);
  const grade = grades.find((candidate) => candidate.id === qualityGradeId);
  const canCount =
    session !== null &&
    (session.status === "draft" || session.status === "reopened") &&
    Number.isSafeInteger(quantityScaled) &&
    quantityScaled >= 0;

  return (
    <section
      aria-labelledby="inventory-stocktake-title"
      className="rounded-card border border-border bg-surface p-4"
    >
      <h2 id="inventory-stocktake-title" className="text-subheading font-semibold">
        Kiểm kê nhanh
      </h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Ghi nhận số đếm thực tế rồi duyệt chênh lệch thành một biến động kho có truy nguyên.
      </p>
      {session === null ? (
        <Button
          className="mt-4"
          disabled={locked}
          onClick={() => onStart({ scopeReference: `product:${productId}`, note: null })}
        >
          Bắt đầu kiểm kê mặt hàng
        </Button>
      ) : (
        <div className="mt-4 grid gap-3">
          <p className="text-body-sm" role="status">
            Phiên {session.status === "approved" ? "đã duyệt" : "đang mở"} · phiên bản{" "}
            {session.version}
          </p>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-label">
              Số đếm thực tế
              <Input
                inputMode="decimal"
                disabled={locked || session.status === "approved"}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <Select
              label="Đơn vị"
              value={unit}
              disabled={locked || session.status === "approved"}
              onChange={(event) => setUnit(event.target.value as Unit)}
              options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
            />
            <Select
              label="Phẩm cấp"
              value={qualityGradeId ?? "legacy"}
              disabled={locked || session.status === "approved"}
              onChange={(event) =>
                setQualityGradeId(
                  event.target.value === "legacy" ? null : (event.target.value as QualityGradeId),
                )
              }
              options={[
                { value: "legacy", label: "Chưa phân loại" },
                ...grades.map((item) => ({ value: item.id, label: item.name })),
              ]}
            />
          </div>
          <TextareaControl
            aria-label="Lý do duyệt kiểm kê"
            disabled={locked || session.status === "approved"}
            placeholder="Lý do hoặc ghi chú kiểm kê"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {session.status === "approved" ? null : (
              <>
                <Button
                  disabled={!canCount || locked}
                  onClick={() => {
                    if (!canCount) return;
                    onCount({
                      qualityGradeId,
                      qualityGradeName: grade?.name ?? null,
                      quantity: { valueScaled: quantityScaled, unit },
                    });
                  }}
                >
                  Ghi số đếm
                </Button>
                <Button
                  tone="secondary"
                  disabled={session.counts.length === 0 || reason.trim().length === 0 || locked}
                  onClick={() => onApprove(reason.trim())}
                >
                  Duyệt chênh lệch
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {feedback}
    </section>
  );
}
