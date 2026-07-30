"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Cursor,
  InventoryMovementDto,
  Page,
  ProductId,
  QualityGradeDto,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import { UNIT_LABEL_VI, UNITS } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { formatInstant, formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";

const movementHref = (movement: InventoryMovementDto) =>
  movement.sourceDocument?.type === "receipt"
    ? `/receipts/${movement.sourceDocument.id}`
    : movement.sourceDocument?.type === "inventory_adjustment"
      ? `/inventory-adjustments/${movement.sourceDocument.id}`
      : null;

const gradeLabel = (gradeName: string | null) => gradeName ?? "Chưa phân loại (lịch sử)";

export default function ProductInventoryPage() {
  const productId = useParams<{ productId: string }>().productId as ProductId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const product = useQuery(trpc.product.get.queryOptions({ workspaceId, productId }));
  const balances = useQuery(trpc.inventory.balances.queryOptions({ workspaceId, productId }));
  const grades = useQuery(
    trpc.quality.list.queryOptions({
      workspaceId,
      isActive: true,
      cursor: null,
      limit: 100,
    }),
  );
  const [unitFilter, setUnitFilter] = useState<Unit | null>(null);
  const [gradeFilter, setGradeFilter] = useState<QualityGradeId | null | undefined>(undefined);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<InventoryMovementDto>[]>([]);
  const timeline = useQuery(
    trpc.inventory.timeline.queryOptions({
      workspaceId,
      productId,
      qualityGradeId: gradeFilter,
      unit: unitFilter,
      cursor,
      limit: 25,
    }),
  );
  useEffect(() => {
    if (timeline.data === undefined) return;
    setPages((current) => (cursor === null ? [timeline.data] : [...current, timeline.data]));
  }, [cursor, timeline.data]);
  const rows = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <QueryStates
        query={product}
        loadingLabel="Đang tải mặt hàng"
        onRetry={() => void product.refetch()}
      >
        {(detail) => (
          <PageHeader
            title="Tồn kho"
            description={detail.displayName}
            back={{ href: `/products/${productId}`, label: "Mặt hàng" }}
          />
        )}
      </QueryStates>
      <QueryStates
        query={balances}
        loadingLabel="Đang tải số lượng"
        onRetry={() => void balances.refetch()}
      >
        {(items) =>
          items.length === 0 ? (
            <p>Chưa có biến động vật lý.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((balance) => (
                <section
                  key={`${balance.qualityGradeId ?? "legacy"}:${balance.unit}`}
                  className="rounded-card border border-border bg-surface p-4"
                >
                  <p className="text-label text-ink-muted">
                    {gradeLabel(balance.qualityGradeName)}
                  </p>
                  <p className="text-heading font-bold">
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
                    {balance.classification}
                  </Badge>
                </section>
              ))}
            </div>
          )
        }
      </QueryStates>
      <Select
        label="Lọc theo phẩm cấp"
        value={gradeFilter === undefined ? "" : (gradeFilter ?? "legacy")}
        onChange={(event) => {
          setGradeFilter(
            event.target.value === ""
              ? undefined
              : event.target.value === "legacy"
                ? null
                : (event.target.value as QualityGradeId),
          );
          setCursor(null);
          setPages([]);
        }}
        placeholder="Tất cả phẩm cấp, không cộng gộp"
        options={[
          ...(balances.data?.some((row) => row.qualityGradeId === null)
            ? [{ value: "legacy", label: "Chưa phân loại (lịch sử)" }]
            : []),
          ...(grades.data?.items.map((grade) => ({ value: grade.id, label: grade.name })) ?? []),
        ]}
      />
      <Select
        label="Lọc theo đơn vị"
        value={unitFilter ?? ""}
        onChange={(event) => {
          setUnitFilter(event.target.value === "" ? null : (event.target.value as Unit));
          setCursor(null);
          setPages([]);
        }}
        placeholder="Tất cả đơn vị, không cộng gộp"
        options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
      />
      <QueryStates
        query={timeline}
        loadingLabel="Đang tải biến động kho"
        onRetry={() => void timeline.refetch()}
      >
        {() =>
          rows.length === 0 ? (
            <p>Không có biến động phù hợp.</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((movement) => {
                const href = movementHref(movement);
                return (
                  <li
                    key={movement.id}
                    className="rounded-card border border-border bg-surface p-3"
                  >
                    <div className="flex justify-between">
                      <span>
                        {movement.sourceType.replaceAll("_", " ")} ·{" "}
                        {gradeLabel(movement.qualityGradeName)}
                      </span>
                      <strong>{formatQuantity(movement.quantity)}</strong>
                    </div>
                    <p className="text-caption text-ink-muted">
                      {formatInstant(movement.transactionTime)}
                    </p>
                    {movement.reason === null ? null : <p>{movement.reason}</p>}
                    {href === null ? null : (
                      <Link href={href} className="text-info underline">
                        Mở nguồn
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>
          )
        }
      </QueryStates>
      {next === null ? null : (
        <Button tone="secondary" disabled={timeline.isFetching} onClick={() => setCursor(next)}>
          {timeline.isFetching ? "Đang tải" : "Tải thêm"}
        </Button>
      )}
      {session.permissions.includes("inventory.adjust") ? (
        <InventoryAdjustment
          productId={productId}
          grades={grades.data?.items ?? []}
          onChanged={() => {
            setCursor(null);
            setPages([]);
            void Promise.all([balances.refetch(), timeline.refetch()]);
          }}
        />
      ) : null}
      {session.permissions.includes("inventory.reclassify") ? (
        <InventoryReclassification
          productId={productId}
          grades={grades.data?.items ?? []}
          onChanged={() => {
            setCursor(null);
            setPages([]);
            void Promise.all([balances.refetch(), timeline.refetch()]);
          }}
        />
      ) : null}
    </div>
  );
}

function InventoryAdjustment(props: {
  productId: ProductId;
  grades: readonly QualityGradeDto[];
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const adjustmentId = useRef(crypto.randomUUID()).current;
  const [direction, setDirection] = useState<"increase" | "decrease">("increase");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [qualityGradeId, setQualityGradeId] = useState<QualityGradeId | null>(null);
  const [reasonCode, setReasonCode] = useState<
    "opening_balance" | "count_correction" | "spoilage" | "shrinkage" | "other"
  >("count_correction");
  const [reason, setReason] = useState("");
  const mutation = useMutation(trpc.inventory.adjust.mutationOptions());
  const command = useCommand<unknown, { adjustmentId: string }>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const refreshedAdjustmentId = useRef<string | null>(null);
  useEffect(() => {
    if (command.result === null || refreshedAdjustmentId.current === command.result.adjustmentId)
      return;
    refreshedAdjustmentId.current = command.result.adjustmentId;
    props.onChanged();
  }, [command.result, props.onChanged]);
  const quantityScaled = Math.round(Number(quantity) * 1000);
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Điều chỉnh tồn kho</h2>
      <div className="grid gap-3 md:grid-cols-3">
        <Select
          label="Hướng"
          value={direction}
          onChange={(event) => setDirection(event.target.value as typeof direction)}
          options={[
            { value: "increase", label: "Tăng" },
            { value: "decrease", label: "Giảm" },
          ]}
        />
        <label className="text-label">
          Số lượng
          <input
            className={INPUT_CLASS}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <Select
          label="Đơn vị"
          value={unit}
          onChange={(event) => setUnit(event.target.value as Unit)}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
        />
      </div>
      <Select
        label="Phẩm cấp"
        value={qualityGradeId ?? ""}
        onChange={(event) => setQualityGradeId(event.target.value as QualityGradeId)}
        placeholder="Chọn phẩm cấp"
        options={props.grades.map((grade) => ({ value: grade.id, label: grade.name }))}
      />
      <Select
        label="Mã lý do"
        value={reasonCode}
        onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)}
        options={[
          { value: "opening_balance", label: "Số dư đầu kỳ" },
          { value: "count_correction", label: "Kiểm đếm" },
          { value: "spoilage", label: "Hư hỏng" },
          { value: "shrinkage", label: "Hao hụt" },
          { value: "other", label: "Khác" },
        ]}
      />
      <label className="text-label">
        Giải thích
        <textarea
          className={INPUT_CLASS}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button
        disabled={
          !Number.isSafeInteger(quantityScaled) ||
          quantityScaled <= 0 ||
          reason.trim().length === 0 ||
          qualityGradeId === null
        }
        onClick={() =>
          void command.submit({
            adjustmentId,
            productId: props.productId,
            qualityGradeId,
            qualityGradeName: props.grades.find((grade) => grade.id === qualityGradeId)?.name ?? "",
            quantity: { valueScaled: quantityScaled, unit },
            direction,
            reasonCode,
            reason: reason.trim(),
          })
        }
      >
        Ghi điều chỉnh
      </Button>
      <CommandOutcome
        command={command}
        attemptedAction="Điều chỉnh tồn kho"
        onReload={props.onChanged}
      />
    </section>
  );
}

function InventoryReclassification(props: {
  productId: ProductId;
  grades: readonly QualityGradeDto[];
  onChanged: () => void;
}) {
  const trpc = useTRPC();
  const reclassificationId = useRef(crypto.randomUUID()).current;
  const [fromGradeId, setFromGradeId] = useState<QualityGradeId | null>(null);
  const [toGradeId, setToGradeId] = useState<QualityGradeId | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<Unit>("kg");
  const [reason, setReason] = useState("");
  const mutation = useMutation(trpc.inventory.reclassify.mutationOptions());
  const command = useCommand<unknown, { reclassificationId: string }>((envelope) =>
    mutation.mutateAsync(envelope as never),
  );
  const refreshedReclassificationId = useRef<string | null>(null);
  useEffect(() => {
    if (
      command.result === null ||
      refreshedReclassificationId.current === command.result.reclassificationId
    )
      return;
    refreshedReclassificationId.current = command.result.reclassificationId;
    props.onChanged();
  }, [command.result, props.onChanged]);
  const quantityScaled = Math.round(Number(quantity) * 1000);
  const fromGrade = props.grades.find((grade) => grade.id === fromGradeId);
  const toGrade = props.grades.find((grade) => grade.id === toGradeId);
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <h2 className="text-subheading font-semibold">Chuyển phẩm cấp</h2>
      <p className="text-body-sm text-ink-muted">
        Ghi hai biến động bù trừ trong cùng giao dịch; tổng số lượng không đổi.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <Select
          label="Từ phẩm cấp"
          value={fromGradeId ?? ""}
          onChange={(event) => setFromGradeId(event.target.value as QualityGradeId)}
          placeholder="Chọn phẩm cấp nguồn"
          options={props.grades.map((grade) => ({ value: grade.id, label: grade.name }))}
        />
        <Select
          label="Sang phẩm cấp"
          value={toGradeId ?? ""}
          onChange={(event) => setToGradeId(event.target.value as QualityGradeId)}
          placeholder="Chọn phẩm cấp đích"
          options={props.grades.map((grade) => ({ value: grade.id, label: grade.name }))}
        />
        <label className="text-label">
          Số lượng
          <input
            className={INPUT_CLASS}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <Select
          label="Đơn vị"
          value={unit}
          onChange={(event) => setUnit(event.target.value as Unit)}
          options={UNITS.map((value) => ({ value, label: UNIT_LABEL_VI[value] }))}
        />
      </div>
      <label className="text-label">
        Lý do
        <textarea
          className={INPUT_CLASS}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <Button
        disabled={
          fromGrade === undefined ||
          toGrade === undefined ||
          fromGrade.id === toGrade.id ||
          !Number.isSafeInteger(quantityScaled) ||
          quantityScaled <= 0 ||
          reason.trim().length === 0
        }
        onClick={() => {
          if (fromGrade === undefined || toGrade === undefined) return;
          void command.submit({
            reclassificationId,
            productId: props.productId,
            fromQualityGradeId: fromGrade.id,
            fromQualityGradeName: fromGrade.name,
            toQualityGradeId: toGrade.id,
            toQualityGradeName: toGrade.name,
            quantity: { valueScaled: quantityScaled, unit },
            reason: reason.trim(),
          });
        }}
      >
        Ghi chuyển phẩm cấp
      </Button>
      <CommandOutcome
        command={command}
        attemptedAction="Chuyển phẩm cấp"
        onReload={props.onChanged}
      />
    </section>
  );
}
