"use client";

import type {
  StocktakeCountDto,
  StocktakeCountId,
  StocktakeDto,
  StocktakePreflightDto,
  StocktakePreviewDto,
  QualityGradeDto,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { Select } from "@/ui/primitives/select.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { formatInstant, formatQuantity } from "@/ui/format.ts";

export type InventoryStocktakePanelProps = {
  readonly productId: string;
  readonly grades: readonly QualityGradeDto[];
  readonly qualityGradeMode?: "disabled" | "required" | undefined;
  readonly session: StocktakeDto | null;
  readonly preview?: StocktakePreviewDto | null | undefined;
  readonly preflight?: StocktakePreflightDto | null | undefined;
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
    readonly supersedesCountId: StocktakeCountId | null;
  }) => void;
  readonly onApprove: (input: {
    readonly expectedVersion: number;
    readonly expectedPreviewHash: string;
    readonly reason: string;
  }) => void;
  readonly onReopen?: ((reason: string) => void) | undefined;
};

export function InventoryStocktakePanel({
  productId,
  grades,
  qualityGradeMode = "required",
  session,
  preview = null,
  preflight = null,
  locked,
  feedback,
  onStart,
  onCount,
  onApprove,
  onReopen,
}: InventoryStocktakePanelProps) {
  const [viewMode, setViewMode] = useState<"counting" | "reviewing">("counting");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | null>(null);
  const [editingCount, setEditingCount] = useState<StocktakeCountDto | null>(null);
  const [approvalReason, setApprovalReason] = useState("");
  const [reopenReason, setReopenReason] = useState("");

  const parsedQuantity = parseQuantityText(quantity, unit);
  const quantityScaled =
    parsedQuantity.ok && parsedQuantity.value !== null ? parsedQuantity.value.valueScaled : 0;
  const grade = grades.find((candidate) => candidate.id === qualityGradeId);

  useEffect(() => {
    if (qualityGradeMode === "required" && qualityGradeId === null && grades.length > 0) {
      setQualityGradeId(grades[0]!.id);
    }
  }, [qualityGradeMode, qualityGradeId, grades]);

  const canCount =
    session !== null &&
    (session.status === "draft" || session.status === "reopened") &&
    Number.isSafeInteger(quantityScaled) &&
    quantityScaled >= 0 &&
    (qualityGradeMode === "disabled" || grade !== undefined);

  const activeCounts = session?.activeCounts ?? session?.counts ?? [];

  function handleStartEditing(count: StocktakeCountDto) {
    setEditingCount(count);
    setQuantity(String(count.quantity.valueScaled / 1000));
    setUnit(count.quantity.unit);
    setQualityGradeId(count.qualityGradeId);
  }

  function handleCancelEditing() {
    setEditingCount(null);
    setQuantity("");
    if (qualityGradeMode === "required" && grades.length > 0) {
      setQualityGradeId(grades[0]!.id);
    } else {
      setQualityGradeId(null);
    }
  }

  function handleSubmitCount() {
    if (!canCount) return;
    onCount({
      qualityGradeId: qualityGradeMode === "disabled" ? null : (grade?.id ?? null),
      qualityGradeName: qualityGradeMode === "disabled" ? null : (grade?.name ?? null),
      quantity: { valueScaled: quantityScaled, unit },
      supersedesCountId: editingCount?.id ?? null,
    });
    setEditingCount(null);
    setQuantity("");
  }

  return (
    <section
      aria-labelledby="inventory-stocktake-title"
      className="rounded-card border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="inventory-stocktake-title" className="text-subheading font-semibold">
            Kiểm kê tồn kho
          </h2>
          <p className="mt-1 text-body-sm text-ink-muted">
            Ghi nhận số đếm thực tế rồi duyệt chênh lệch thành một biến động kho có truy nguyên.
          </p>
        </div>
        {session !== null ? (
          <span
            className={`rounded-pill px-2.5 py-0.5 text-caption font-medium ${
              session.status === "approved"
                ? "bg-leaf-muted text-leaf"
                : "bg-surface-muted text-ink"
            }`}
          >
            {session.status === "approved"
              ? "Đã duyệt"
              : session.status === "reopened"
                ? "Đã mở lại"
                : "Đang mở"}{" "}
            · Phiên bản {session.version}
          </span>
        ) : null}
      </div>

      {session === null ? (
        <div className="mt-4">
          {preflight !== null && !preflight.canStart ? (
            <div className="mb-3 rounded-card border border-amber-300 bg-amber-50 p-3 text-body-sm text-amber-900">
              <p className="font-semibold">Chưa thể bắt đầu kiểm kê:</p>
              <p className="mt-0.5">
                {preflight.message ?? "Chưa có chính sách kiểm kê tồn kho hợp lệ được phê duyệt."}
              </p>
            </div>
          ) : null}
          <Button
            className="mt-2"
            disabled={locked || (preflight !== null && !preflight.canStart)}
            onClick={() => onStart({ scopeReference: `product:${productId}`, note: null })}
          >
            Bắt đầu kiểm kê mặt hàng
          </Button>
        </div>
      ) : session.status === "approved" ? (
        <div className="mt-4 grid gap-4">
          <div>
            <h3 className="text-body-sm font-semibold text-ink">Kết quả kiểm kê đã chốt</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border text-ink-muted">
                    <th className="pb-2">Hạng hàng</th>
                    <th className="pb-2">Đơn vị</th>
                    <th className="pb-2 text-right">Số đếm thực tế</th>
                    <th className="pb-2">Thời điểm ghi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {activeCounts.map((count) => (
                    <tr key={count.id}>
                      <td className="py-2">{count.qualityGradeName ?? "Chưa phân loại"}</td>
                      <td className="py-2">{UNIT_LABEL_VI[count.quantity.unit]}</td>
                      <td className="py-2 text-right font-medium">
                        {formatQuantity(count.quantity)}
                      </td>
                      <td className="py-2 text-ink-muted">{formatInstant(count.recordedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {onReopen !== undefined ? (
            <div className="mt-2 rounded-card border border-border bg-surface-muted p-3">
              <h4 className="text-body-sm font-semibold">Mở lại phiên kiểm kê</h4>
              <p className="mt-0.5 text-caption text-ink-muted">
                Mở lại phiên sẽ hoàn tác các biến động chênh lệch đã duyệt và cho phép đếm/sửa lại.
              </p>
              <div className="mt-2 grid gap-2">
                <Textarea
                  label="Lý do mở lại phiên"
                  placeholder="Nhập lý do cần mở lại kiểm kê"
                  value={reopenReason}
                  disabled={locked}
                  onChange={(event) => setReopenReason(event.target.value)}
                />
                <div className="flex justify-end">
                  <Button
                    tone="secondary"
                    disabled={locked || reopenReason.trim().length === 0}
                    onClick={() => onReopen(reopenReason.trim())}
                  >
                    Mở lại phiên kiểm kê
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      ) : viewMode === "counting" ? (
        <div className="mt-4 grid gap-4">
          {activeCounts.length > 0 ? (
            <div>
              <h3 className="text-body-sm font-semibold text-ink">Số đếm hiện tại trong phiên</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-border text-ink-muted">
                      <th className="pb-2">Hạng hàng</th>
                      <th className="pb-2">Đơn vị</th>
                      <th className="pb-2 text-right">Số đếm</th>
                      <th className="pb-2">Thời điểm ghi</th>
                      <th className="pb-2 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeCounts.map((count) => (
                      <tr key={count.id}>
                        <td className="py-2 font-medium">
                          {count.qualityGradeName ?? "Chưa phân loại"}
                        </td>
                        <td className="py-2">{UNIT_LABEL_VI[count.quantity.unit]}</td>
                        <td className="py-2 text-right font-medium">
                          {formatQuantity(count.quantity)}
                        </td>
                        <td className="py-2 text-ink-muted">{formatInstant(count.recordedAt)}</td>
                        <td className="py-2 text-right">
                          <Button
                            tone="secondary"
                            disabled={locked || editingCount?.id === count.id}
                            onClick={() => handleStartEditing(count)}
                          >
                            Sửa
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="rounded-card border border-border bg-surface-muted p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-body-sm font-semibold text-ink">
                {editingCount !== null
                  ? `Sửa số đếm cho ${editingCount.qualityGradeName ?? "mặt hàng"} (Số cũ: ${formatQuantity(editingCount.quantity)})`
                  : "Ghi nhận số đếm"}
              </h3>
              {editingCount !== null ? (
                <Button tone="secondary" onClick={handleCancelEditing}>
                  Hủy sửa
                </Button>
              ) : null}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <QuantityInput
                label="Số đếm thực tế"
                unit={unit}
                unitLabel={UNIT_LABEL_VI[unit]}
                disabled={locked}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              <Select
                label="Đơn vị"
                value={unit}
                disabled={locked || editingCount !== null}
                onChange={(event) => setUnit(event.target.value as Unit)}
                options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
              />
              {qualityGradeMode === "required" ? (
                <Select
                  label="Hạng hàng"
                  value={qualityGradeId ?? ""}
                  disabled={locked || editingCount !== null}
                  onChange={(event) => setQualityGradeId(event.target.value as QualityGradeId)}
                  options={grades.map((item) => ({ value: item.id, label: item.name }))}
                />
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button disabled={!canCount || locked} onClick={handleSubmitCount}>
                {editingCount !== null ? "Cập nhật số đếm" : "Ghi số đếm"}
              </Button>
              {activeCounts.length > 0 && editingCount === null ? (
                <Button tone="secondary" disabled={locked} onClick={() => setViewMode("reviewing")}>
                  Xem trước chênh lệch & duyệt →
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          <div className="rounded-card border border-border bg-surface p-3">
            <h3 className="text-body-sm font-semibold text-ink">
              Bảng đối chiếu chênh lệch thực tế vs sổ sách
            </h3>
            <p className="mt-0.5 text-caption text-ink-muted">
              Số tồn sổ sách được tính tại thời điểm chốt phiên{" "}
              {session.asOf ? formatInstant(session.asOf) : ""}.
            </p>

            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead>
                  <tr className="border-b border-border text-ink-muted">
                    <th className="pb-2">Hạng hàng</th>
                    <th className="pb-2">Đơn vị</th>
                    <th className="pb-2 text-right">Tồn sổ sách</th>
                    <th className="pb-2 text-right">Số đếm thực tế</th>
                    <th className="pb-2 text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {preview?.rows.map((row) => {
                    const isNeg = row.varianceScaled < 0;
                    const isPos = row.varianceScaled > 0;
                    const sign = isPos ? "+" : "";
                    return (
                      <tr key={`${row.productId}:${row.qualityGradeId ?? "ungraded"}:${row.unit}`}>
                        <td className="py-2 font-medium">
                          {row.qualityGradeName ?? "Chưa phân loại"}
                        </td>
                        <td className="py-2">{UNIT_LABEL_VI[row.unit]}</td>
                        <td className="py-2 text-right text-ink-muted">
                          {formatQuantity({
                            valueScaled: row.expectedQuantityScaled,
                            unit: row.unit,
                          })}
                        </td>
                        <td className="py-2 text-right font-medium">
                          {formatQuantity({
                            valueScaled: row.countedQuantityScaled,
                            unit: row.unit,
                          })}
                        </td>
                        <td
                          className={`py-2 text-right font-bold ${
                            isNeg ? "text-danger" : isPos ? "text-leaf" : "text-ink-muted"
                          }`}
                        >
                          {sign}
                          {formatQuantity({ valueScaled: row.varianceScaled, unit: row.unit })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <Textarea
            label="Lý do duyệt kiểm kê"
            disabled={locked}
            placeholder="Nhập lý do chốt và duyệt chênh lệch tồn kho"
            value={approvalReason}
            onChange={(event) => setApprovalReason(event.target.value)}
          />

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button tone="secondary" disabled={locked} onClick={() => setViewMode("counting")}>
              ← Quay lại đếm tiếp
            </Button>
            <Button
              disabled={preview === null || approvalReason.trim().length === 0 || locked}
              onClick={() => {
                if (preview === null) return;
                onApprove({
                  expectedVersion: session.version,
                  expectedPreviewHash: preview.previewHash,
                  reason: approvalReason.trim(),
                });
              }}
            >
              Xác nhận duyệt chênh lệch
            </Button>
          </div>
        </div>
      )}
      {feedback}
    </section>
  );
}
