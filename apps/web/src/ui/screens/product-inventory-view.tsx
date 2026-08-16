"use client";

import type {
  InventoryBalanceDto,
  InventoryMovementDto,
  InventoryValuationResult,
  ProductCoverageDto,
  ProductDto,
  QualityGradeDto,
  QualityGradeId,
  StockPlanningDto,
  Unit,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { copyForReportDiagnostic } from "@/ui/copy.ts";
import { formatCoverageAvailability } from "@/ui/domain/product-coverage.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageFrame, PageHeader, Section } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Select } from "@/ui/primitives/select.tsx";

export type ProductInventorySection = "overview" | "movements" | "planning" | "adjustments";

export type ProductInventoryViewProps = {
  readonly productId: ProductDto["id"];
  readonly activeSection: ProductInventorySection;
  readonly onSectionChange: (section: ProductInventorySection) => void;
  readonly productQuery: QueryLike<ProductDto>;
  readonly balancesQuery: QueryLike<readonly InventoryBalanceDto[]>;
  readonly coverageQuery: QueryLike<readonly ProductCoverageDto[]>;
  readonly coverage: ProductCoverageDto | undefined;
  readonly valuationQuery: QueryLike<InventoryValuationResult>;
  readonly planningQuery: QueryLike<StockPlanningDto>;
  readonly timelineQuery: QueryLike<unknown> & { readonly isFetching: boolean };
  readonly balances: readonly InventoryBalanceDto[];
  readonly grades: readonly QualityGradeDto[];
  readonly movements: readonly InventoryMovementDto[];
  readonly gradeFilter: QualityGradeId | null | undefined;
  readonly unitFilter: Unit | null;
  readonly hasMore: boolean;
  readonly adjustment?: ReactNode;
  readonly reclassification?: ReactNode;
  readonly stocktake?: ReactNode;
  readonly onGradeFilterChange: (value: QualityGradeId | null | undefined) => void;
  readonly onUnitFilterChange: (value: Unit | null) => void;
  readonly onLoadMore: () => void;
  readonly onRetryProduct: () => void;
  readonly onRetryBalances: () => void;
  readonly onRetryCoverage: () => void;
  readonly onRetryTimeline: () => void;
};

const SECTION_LABELS: ReadonlyArray<{
  readonly id: ProductInventorySection;
  readonly label: string;
}> = [
  { id: "overview", label: "Tổng quan" },
  { id: "movements", label: "Biến động" },
  { id: "planning", label: "Kế hoạch" },
  { id: "adjustments", label: "Điều chỉnh" },
];

const gradeLabel = (gradeName: string | null) => gradeName ?? "Chưa phân loại (lịch sử)";

export function ProductInventoryView(props: ProductInventoryViewProps) {
  const hasAdjustmentTools =
    props.adjustment !== undefined ||
    props.reclassification !== undefined ||
    props.stocktake !== undefined;
  const sections = hasAdjustmentTools
    ? SECTION_LABELS
    : SECTION_LABELS.filter((section) => section.id !== "adjustments");

  return (
    <PageFrame size="wide">
      <div className="flex flex-col gap-5">
        <QueryStates
          query={props.productQuery}
          loadingLabel="Đang tải mặt hàng"
          onRetry={props.onRetryProduct}
        >
          {(detail) => (
            <PageHeader
              title={detail.displayName}
              description="Tồn thực tế và lượng hàng cần để đáp ứng các đơn đã chốt."
              back={{ href: "/products", label: "Hàng hóa & kho" }}
              actions={
                <Link
                  href={`/products/${props.productId}`}
                  className="font-semibold text-info underline-offset-4 hover:underline"
                >
                  Sửa thông tin mặt hàng
                </Link>
              }
            />
          )}
        </QueryStates>

        <QueryStates
          query={props.coverageQuery}
          loadingLabel="Đang đối chiếu tồn kho và các đơn đã chốt"
          onRetry={props.onRetryCoverage}
        >
          {() => <CoverageSummary coverage={props.coverage} />}
        </QueryStates>

        <div
          role="tablist"
          aria-label="Nội dung hàng hóa và kho"
          className="flex gap-1 overflow-x-auto border-b border-border"
        >
          {sections.map((section) => {
            const selected = props.activeSection === section.id;
            return (
              <Button
                key={section.id}
                tone="link"
                role="tab"
                aria-selected={selected}
                aria-controls={`inventory-panel-${section.id}`}
                id={`inventory-tab-${section.id}`}
                onClick={() => props.onSectionChange(section.id)}
                className={[
                  "min-h-11 shrink-0 border-b-2 px-3 no-underline hover:no-underline",
                  selected
                    ? "border-primary text-primary"
                    : "border-transparent text-ink-muted hover:text-ink",
                ].join(" ")}
              >
                {section.label}
              </Button>
            );
          })}
        </div>

        {props.activeSection === "overview" ? (
          <InventoryOverview {...props} />
        ) : props.activeSection === "movements" ? (
          <InventoryMovements {...props} />
        ) : props.activeSection === "planning" ? (
          <InventoryPlanning {...props} />
        ) : (
          <InventoryAdjustments {...props} />
        )}
      </div>
    </PageFrame>
  );
}

function CoverageSummary({ coverage }: { readonly coverage: ProductCoverageDto | undefined }) {
  const quantities = coverage?.quantities ?? [];
  if (quantities.length === 0) {
    return (
      <section className="rounded-card border border-border bg-surface p-4">
        <h2 className="text-subheading font-semibold">Khả dụng sau các đơn đã chốt</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Chưa có tồn kho, đơn mua đã xác nhận hoặc đơn bán cần giao cho mặt hàng này.
        </p>
      </section>
    );
  }
  return (
    <section className="grid gap-3 rounded-card border border-border bg-surface p-4">
      <div>
        <h2 className="text-subheading font-semibold">Khả dụng sau các đơn đã chốt</h2>
        <p className="mt-1 text-body-sm text-ink-muted">
          Tồn thực tế + đang mua − cần giao. Đơn khách đặt trước chưa được cộng để tránh tính hai
          lần.
        </p>
      </div>
      <div className="grid gap-3 xl:grid-cols-2">
        {quantities.map((quantity) => (
          <div
            key={quantity.unit}
            className="grid gap-3 border-t border-border pt-3 sm:grid-cols-4"
          >
            <CoverageFact label="Tồn thực tế" value={formatQuantity(quantity.onHand)} />
            <CoverageFact label="Đang mua" value={formatQuantity(quantity.inboundRemaining)} />
            <CoverageFact label="Cần giao" value={formatQuantity(quantity.outboundRemaining)} />
            <div>
              <p className="text-caption text-ink-muted">Sau đơn đã chốt</p>
              <p
                className={[
                  "mt-1 font-semibold tabular-nums",
                  quantity.classification === "shortage" ? "text-danger" : "text-ink",
                ].join(" ")}
              >
                {formatCoverageAvailability(quantity)}
              </p>
              <Badge tone={quantity.classification === "shortage" ? "warning" : "positive"}>
                {quantity.classification === "shortage"
                  ? "Thiếu hàng"
                  : quantity.classification === "idle"
                    ? "Chưa phát sinh"
                    : "Đủ theo đơn"}
              </Badge>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CoverageFact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-caption text-ink-muted">{label}</p>
      <p className="mt-1 font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function InventoryOverview(props: ProductInventoryViewProps) {
  return (
    <div
      role="tabpanel"
      id="inventory-panel-overview"
      aria-labelledby="inventory-tab-overview"
      className="grid gap-4"
    >
      <Section
        title="Tồn thực tế theo hạng hàng"
        description="Số lượng lấy từ các biến động nhập, xuất, trả hàng, kiểm kê và điều chỉnh."
      >
        <QueryStates
          query={props.balancesQuery}
          loadingLabel="Đang tải số lượng"
          onRetry={props.onRetryBalances}
        >
          {() =>
            props.balances.length === 0 ? (
              <p className="text-body-sm text-ink-muted">Chưa có biến động vật lý.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {props.balances.map((balance) => (
                  <InventoryBalanceCard
                    key={`${balance.qualityGradeId ?? "legacy"}:${balance.unit}`}
                    balance={balance}
                  />
                ))}
              </div>
            )
          }
        </QueryStates>
      </Section>
    </div>
  );
}

function InventoryMovements(props: ProductInventoryViewProps) {
  return (
    <div
      role="tabpanel"
      id="inventory-panel-movements"
      aria-labelledby="inventory-tab-movements"
      className="grid gap-4"
    >
      <section className="grid gap-3 border-y border-border py-4 md:grid-cols-2">
        <Select
          label="Lọc theo hạng hàng"
          value={props.gradeFilter === undefined ? "" : (props.gradeFilter ?? "legacy")}
          onChange={(event) =>
            props.onGradeFilterChange(
              event.target.value === ""
                ? undefined
                : event.target.value === "legacy"
                  ? null
                  : (event.target.value as QualityGradeId),
            )
          }
          placeholder="Tất cả hạng hàng, không cộng gộp"
          options={[
            ...(props.balances.some((row) => row.qualityGradeId === null)
              ? [{ value: "legacy", label: "Chưa phân loại (lịch sử)" }]
              : []),
            ...props.grades.map((grade) => ({ value: grade.id, label: grade.name })),
          ]}
        />
        <Select
          label="Lọc theo đơn vị"
          value={props.unitFilter ?? ""}
          onChange={(event) =>
            props.onUnitFilterChange(
              event.target.value === "" ? null : (event.target.value as Unit),
            )
          }
          placeholder="Tất cả đơn vị, không cộng gộp"
          options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
        />
      </section>
      <Section title="Biến động kho">
        <QueryStates
          query={props.timelineQuery}
          loadingLabel="Đang tải biến động kho"
          onRetry={props.onRetryTimeline}
        >
          {() =>
            props.movements.length === 0 ? (
              <p className="text-body-sm text-ink-muted">Không có biến động phù hợp.</p>
            ) : (
              <ol className="flex flex-col gap-2">
                {props.movements.map((movement) => (
                  <InventoryMovementRow key={movement.id} movement={movement} />
                ))}
              </ol>
            )
          }
        </QueryStates>
        {props.hasMore ? (
          <Button
            tone="secondary"
            disabled={props.timelineQuery.isFetching}
            onClick={props.onLoadMore}
          >
            {props.timelineQuery.isFetching ? "Đang tải" : "Tải thêm"}
          </Button>
        ) : null}
      </Section>
    </div>
  );
}

function InventoryPlanning(props: ProductInventoryViewProps) {
  return (
    <div
      role="tabpanel"
      id="inventory-panel-planning"
      aria-labelledby="inventory-tab-planning"
      className="grid gap-6"
    >
      <Section
        title="Kế hoạch tồn kho"
        description="Khuyến nghị theo mức tồn đã được vựa duyệt; không thay thế phần đối chiếu đơn ở trên."
      >
        <QueryStates query={props.planningQuery} loadingLabel="Đang tính kế hoạch tồn kho">
          {(result) => (
            <StockPlanningResultView
              productId={props.productId}
              result={result}
              grades={props.grades}
            />
          )}
        </QueryStates>
      </Section>
      <Section
        title="Định giá tồn kho"
        description="Chỉ hiện khi vựa đã có cách tính giá trị tồn kho đang dùng."
      >
        <QueryStates query={props.valuationQuery} loadingLabel="Đang tính giá trị tồn kho">
          {(valuation) => <InventoryValuationResultView result={valuation} grades={props.grades} />}
        </QueryStates>
      </Section>
    </div>
  );
}

function InventoryAdjustments(props: ProductInventoryViewProps) {
  return (
    <div
      role="tabpanel"
      id="inventory-panel-adjustments"
      aria-labelledby="inventory-tab-adjustments"
      className="grid gap-5"
    >
      {props.adjustment}
      {props.reclassification}
      {props.stocktake}
    </div>
  );
}

function StockPlanningResultView({
  productId,
  result,
  grades,
}: {
  readonly productId: ProductDto["id"];
  readonly result: StockPlanningDto;
  readonly grades: readonly QualityGradeDto[];
}) {
  if (result.status === "unavailable") {
    return (
      <p className="rounded-card border border-border bg-canvas p-3 text-body-sm">
        Kế hoạch chưa sẵn sàng:{" "}
        {result.diagnostics.map(copyForReportDiagnostic).join(", ") || "chưa có cấu hình hiệu lực"}.
      </p>
    );
  }
  const rows = result.rows.filter((row) => row.productId === productId);
  const gradeMap = new Map(grades.map((g) => [g.id, g.name]));
  return rows.length === 0 ? (
    <p className="text-body-sm text-ink-muted">Mặt hàng này chưa có quy tắc tồn kho.</p>
  ) : (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div
          key={`${row.qualityGradeId ?? "legacy"}:${row.unit}`}
          className="grid gap-1 rounded-card border border-border bg-surface p-3 sm:grid-cols-3"
        >
          <span>
            {row.qualityGradeId === null
              ? "Chưa phân loại"
              : (gradeMap.get(row.qualityGradeId) ?? "Hạng hàng")}
          </span>
          <span className="tabular-nums">Hiện tại: {formatQuantity(row.currentQuantity)}</span>
          <span className="tabular-nums">Đề xuất: {formatQuantity(row.suggestedQuantity)}</span>
        </div>
      ))}
    </div>
  );
}

function InventoryValuationResultView({
  result,
  grades,
}: {
  readonly result: InventoryValuationResult;
  readonly grades?: readonly QualityGradeDto[] | undefined;
}) {
  if (result.status === "unavailable") {
    return (
      <p role="status" className="rounded-card border border-warning/30 bg-warning-soft p-3">
        Định giá chưa sẵn sàng: {result.diagnostics.map(copyForReportDiagnostic).join(", ")}. Không
        hiển thị số tiền ước đoán.
      </p>
    );
  }
  const gradeMap = new Map(grades?.map((g) => [g.id, g.name]) ?? []);
  return (
    <div className="grid gap-2">
      <p className="text-caption text-ink-muted">
        Cách tính: {result.strategy === "fifo" ? "Nhập trước, xuất trước" : "Bình quân"}
      </p>
      {result.rows.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Chưa có dữ liệu định giá trong phạm vi này.</p>
      ) : (
        result.rows.map((row) => (
          <div
            key={`${row.qualityGradeId ?? "legacy"}:${row.unit}`}
            className="grid gap-1 rounded-card border border-border bg-surface p-3 sm:grid-cols-3"
          >
            <span>
              {row.qualityGradeId === null
                ? "Chưa phân loại"
                : (gradeMap.get(row.qualityGradeId) ?? row.qualityGradeId)}
            </span>
            <span className="tabular-nums">
              Tồn:{" "}
              {row.inventoryValue === null ? "Chưa có dữ liệu" : formatMoney(row.inventoryValue)}
            </span>
            <span className="tabular-nums">
              Giá vốn: {row.cogs === null ? "Chưa có dữ liệu" : formatMoney(row.cogs)}
            </span>
            <span className="tabular-nums">
              Hao hụt phân loại:{" "}
              {row.classifiedLossCost === null
                ? "Chưa có dữ liệu"
                : formatMoney(row.classifiedLossCost)}
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
      return null;
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
      return "Chuyển hạng hàng";
    case "quality_disposition":
      return "Chấp nhận sau kiểm hàng";
    case "quality_disposition_reversal":
      return "Hoàn tác chấp nhận chất lượng";
    case "stocktake_variance":
      return "Chênh lệch kiểm kê";
  }
}
