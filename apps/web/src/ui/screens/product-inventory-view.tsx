"use client";

import type {
  InventoryBalanceDto,
  InventoryMovementDto,
  InventoryValuationResult,
  ProductDto,
  QualityGradeDto,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Select } from "@/ui/primitives/select.tsx";

export type ProductInventoryViewProps = {
  readonly productId: ProductDto["id"];
  readonly productQuery: QueryLike<ProductDto>;
  readonly balancesQuery: QueryLike<readonly InventoryBalanceDto[]>;
  readonly valuationQuery: QueryLike<InventoryValuationResult>;
  readonly timelineQuery: QueryLike<unknown> & { readonly isFetching: boolean };
  readonly balances: readonly InventoryBalanceDto[];
  readonly grades: readonly QualityGradeDto[];
  readonly movements: readonly InventoryMovementDto[];
  readonly gradeFilter: QualityGradeId | null | undefined;
  readonly unitFilter: Unit | null;
  readonly hasMore: boolean;
  readonly adjustment?: ReactNode;
  readonly reclassification?: ReactNode;
  readonly onGradeFilterChange: (value: QualityGradeId | null | undefined) => void;
  readonly onUnitFilterChange: (value: Unit | null) => void;
  readonly onLoadMore: () => void;
  readonly onRetryProduct: () => void;
  readonly onRetryBalances: () => void;
  readonly onRetryTimeline: () => void;
};

const gradeLabel = (gradeName: string | null) => gradeName ?? "Chưa phân loại (lịch sử)";

export function ProductInventoryView({
  productId,
  productQuery,
  balancesQuery,
  valuationQuery,
  timelineQuery,
  balances,
  grades,
  movements,
  gradeFilter,
  unitFilter,
  hasMore,
  adjustment,
  reclassification,
  onGradeFilterChange,
  onUnitFilterChange,
  onLoadMore,
  onRetryProduct,
  onRetryBalances,
  onRetryTimeline,
}: ProductInventoryViewProps) {
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <QueryStates query={productQuery} loadingLabel="Đang tải mặt hàng" onRetry={onRetryProduct}>
        {(detail) => (
          <PageHeader
            title="Tồn kho"
            description={detail.displayName}
            back={{ href: `/products/${productId}`, label: "Mặt hàng" }}
          />
        )}
      </QueryStates>

      <QueryStates query={balancesQuery} loadingLabel="Đang tải số lượng" onRetry={onRetryBalances}>
        {() =>
          balances.length === 0 ? (
            <p className="text-body-sm text-ink-muted">Chưa có biến động vật lý.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balances.map((balance) => (
                <InventoryBalanceCard
                  key={`${balance.qualityGradeId ?? "legacy"}:${balance.unit}`}
                  balance={balance}
                />
              ))}
            </div>
          )
        }
      </QueryStates>

      <section aria-labelledby="valuation-title" className="grid gap-3">
        <div>
          <h2 id="valuation-title" className="text-subheading font-semibold">
            Định giá tồn kho
          </h2>
          <p className="text-body-sm text-ink-muted">
            Kết quả chỉ hiện khi workspace đã chọn policy định giá có hiệu lực.
          </p>
        </div>
        <QueryStates query={valuationQuery} loadingLabel="Đang tính giá trị tồn kho">
          {(valuation) => <InventoryValuationResultView result={valuation} />}
        </QueryStates>
      </section>

      <section className="grid gap-3 border-y border-border py-4 md:grid-cols-2">
        <Select
          label="Lọc theo phẩm cấp"
          value={gradeFilter === undefined ? "" : (gradeFilter ?? "legacy")}
          onChange={(event) =>
            onGradeFilterChange(
              event.target.value === ""
                ? undefined
                : event.target.value === "legacy"
                  ? null
                  : (event.target.value as QualityGradeId),
            )
          }
          placeholder="Tất cả phẩm cấp, không cộng gộp"
          options={[
            ...(balances.some((row) => row.qualityGradeId === null)
              ? [{ value: "legacy", label: "Chưa phân loại (lịch sử)" }]
              : []),
            ...grades.map((grade) => ({ value: grade.id, label: grade.name })),
          ]}
        />
        <Select
          label="Lọc theo đơn vị"
          value={unitFilter ?? ""}
          onChange={(event) =>
            onUnitFilterChange(event.target.value === "" ? null : (event.target.value as Unit))
          }
          placeholder="Tất cả đơn vị, không cộng gộp"
          options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
        />
      </section>

      <section aria-labelledby="movement-title" className="grid gap-3">
        <h2 id="movement-title" className="text-subheading font-semibold">
          Biến động kho
        </h2>
        <QueryStates
          query={timelineQuery}
          loadingLabel="Đang tải biến động kho"
          onRetry={onRetryTimeline}
        >
          {() =>
            movements.length === 0 ? (
              <p className="text-body-sm text-ink-muted">Không có biến động phù hợp.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {movements.map((movement) => (
                  <InventoryMovementRow key={movement.id} movement={movement} />
                ))}
              </ol>
            )
          }
        </QueryStates>
        {hasMore ? (
          <Button tone="secondary" disabled={timelineQuery.isFetching} onClick={onLoadMore}>
            {timelineQuery.isFetching ? "Đang tải" : "Tải thêm"}
          </Button>
        ) : null}
      </section>

      {adjustment}
      {reclassification}
    </div>
  );
}

function InventoryValuationResultView({ result }: { readonly result: InventoryValuationResult }) {
  if (result.status === "unavailable") {
    return (
      <p role="status" className="rounded-card border border-warning/30 bg-warning-soft p-3">
        Định giá chưa sẵn sàng: {result.diagnostics.join(", ")}. Không hiển thị số tiền ước đoán.
      </p>
    );
  }
  return (
    <div className="grid gap-2">
      <p className="text-caption text-ink-muted">
        Strategy: {result.strategy} · Policy: {result.policyVersionId}
      </p>
      {result.rows.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Chưa có dữ liệu định giá trong phạm vi này.</p>
      ) : (
        result.rows.map((row) => (
          <div
            key={`${row.qualityGradeId ?? "legacy"}:${row.unit}`}
            className="grid gap-1 rounded-card border border-border bg-surface p-3 sm:grid-cols-3"
          >
            <span>{row.qualityGradeId ?? "Chưa phân loại"}</span>
            <span className="tabular-nums">
              Tồn:{" "}
              {row.inventoryValue === null ? "Không định giá" : formatMoney(row.inventoryValue)}
            </span>
            <span className="tabular-nums">
              Giá vốn: {row.cogs === null ? "Không định giá" : formatMoney(row.cogs)}
            </span>
          </div>
        ))
      )}
    </div>
  );
}

function InventoryBalanceCard({ balance }: { readonly balance: InventoryBalanceDto }) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <p className="text-label text-ink-muted">{gradeLabel(balance.qualityGradeName)}</p>
      <p className="text-heading font-bold tabular-nums">
        {formatQuantity({ valueScaled: balance.quantityScaled, unit: balance.unit })}
      </p>
      <Badge
        tone={
          balance.classification === "negative"
            ? "warning"
            : balance.classification === "positive"
              ? "positive"
              : "neutral"
        }
      >
        {balance.classification === "negative"
          ? "Âm — cần kiểm tra"
          : balance.classification === "positive"
            ? "Còn hàng"
            : "Hết"}
      </Badge>
    </section>
  );
}

function InventoryMovementRow({ movement }: { readonly movement: InventoryMovementDto }) {
  const href = movementHref(movement);
  return (
    <li className="rounded-card border border-border bg-surface p-3">
      <div className="flex justify-between gap-3">
        <span>
          {movementLabel(movement.sourceType)} · {gradeLabel(movement.qualityGradeName)}
        </span>
        <strong className="whitespace-nowrap tabular-nums">
          {formatQuantity(movement.quantity)}
        </strong>
      </div>
      <p className="text-caption text-ink-muted">{formatInstant(movement.transactionTime)}</p>
      {movement.reason === null ? null : <p className="mt-1 text-body-sm">{movement.reason}</p>}
      {href === null ? null : (
        <Link href={href} className="mt-1 inline-block text-info underline">
          Mở nguồn
        </Link>
      )}
    </li>
  );
}

function movementHref(movement: InventoryMovementDto): string | null {
  const source = movement.sourceDocument;
  if (source === undefined) return null;
  switch (source.type) {
    case "receipt":
      return `/receipts/${source.id}`;
    case "inventory_adjustment":
      return `/inventory-adjustments/${source.id}`;
    case "delivery":
      return `/deliveries/${source.id}`;
    case "inventory_reclassification":
      return `/products/${movement.productId}/inventory`;
    case "quality_disposition":
      return `/quality/dispositions/${source.id}`;
    case "stocktake":
      return `/inventory/stocktakes/${source.id}`;
  }
}

function movementLabel(source: InventoryMovementDto["sourceType"]): string {
  switch (source) {
    case "purchase_receipt":
      return "Nhận hàng";
    case "purchase_receipt_reversal":
      return "Hoàn tác nhận hàng";
    case "inventory_adjustment":
      return "Điều chỉnh tồn kho";
    case "delivery_dispatch":
      return "Xuất giao hàng";
    case "delivery_return":
      return "Hàng trả lại";
    case "inventory_reclassification":
      return "Chuyển phẩm cấp";
    case "quality_disposition":
      return "Chấp nhận sau kiểm định";
    case "quality_disposition_reversal":
      return "Hoàn tác chấp nhận chất lượng";
    case "stocktake_variance":
      return "Chênh lệch kiểm kê";
  }
}
