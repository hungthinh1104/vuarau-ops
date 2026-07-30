"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  Cursor,
  Page,
  SupplierAccountEntryDto,
  SupplierDto,
  SupplierId,
  SupplierPaymentDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { formatInstant, formatMoney, formatSignedMoney } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { INPUT_CLASS } from "@/ui/primitives/field.tsx";
import { Select } from "@/ui/primitives/select.tsx";

const sourceHref = (entry: SupplierAccountEntryDto): string | null => {
  if (entry.sourceDocument?.type === "purchase") return `/purchases/${entry.sourceDocument.id}`;
  if (entry.sourceDocument?.type === "supplier_payment")
    return `/supplier-payments/${entry.sourceDocument.id}`;
  if (entry.sourceDocument?.type === "supplier_adjustment")
    return `/supplier-account-adjustments/${entry.sourceDocument.id}`;
  return null;
};

export default function SupplierDetailPage() {
  const supplierId = useParams<{ supplierId: string }>().supplierId as SupplierId;
  const { workspaceId, session } = useSession();
  const trpc = useTRPC();
  const supplier = useQuery(trpc.supplier.get.queryOptions({ workspaceId, supplierId }));
  const balance = useQuery(trpc.supplier.balance.queryOptions({ workspaceId, supplierId }));
  const reconciliation = useQuery(
    trpc.supplier.reconciliation.queryOptions({ workspaceId, supplierId }),
  );
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [pages, setPages] = useState<readonly Page<SupplierAccountEntryDto>[]>([]);
  const timeline = useQuery(
    trpc.supplier.timeline.queryOptions({ workspaceId, supplierId, cursor, limit: 25 }),
  );
  useEffect(() => {
    if (timeline.data === undefined) return;
    setPages((current) => (cursor === null ? [timeline.data] : [...current, timeline.data]));
  }, [cursor, timeline.data]);
  const entries = pages.flatMap((page) => page.items);
  const next = pages.at(-1)?.nextCursor ?? null;
  const refetchSupplier = supplier.refetch;
  const refetchBalance = balance.refetch;
  const refetchReconciliation = reconciliation.refetch;
  const refetchTimeline = timeline.refetch;
  const refresh = useCallback(() => {
    setCursor(null);
    setPages([]);
    void Promise.all([
      refetchSupplier(),
      refetchBalance(),
      refetchReconciliation(),
      refetchTimeline(),
    ]);
  }, [refetchBalance, refetchReconciliation, refetchSupplier, refetchTimeline]);
  return (
    <QueryStates
      query={supplier}
      loadingLabel="Đang tải nhà cung cấp"
      onRetry={() => void supplier.refetch()}
    >
      {(record) => (
        <div className="flex max-w-4xl flex-col gap-5">
          <PageHeader
            title={record.displayName}
            description={`${record.phone ?? "Không có số điện thoại"} · phiên bản ${record.version}`}
            back={{ href: "/suppliers", label: "Nhà cung cấp" }}
            status={
              <Badge tone={record.isActive ? "positive" : "neutral"}>
                {record.isActive ? "Đang hoạt động" : "Đã ngưng"}
              </Badge>
            }
          />
          {record.note === null ? null : <p>{record.note}</p>}
          <div className="flex flex-wrap gap-3">
            {session.permissions.includes("supplier.update") ? (
              <Link href={`/suppliers/${record.id}/edit`} className="text-info underline">
                Sửa hồ sơ
              </Link>
            ) : null}
            {session.permissions.includes("purchase.create") && record.isActive ? (
              <Link href={`/purchases/new?supplierId=${record.id}`} className="text-info underline">
                Tạo đơn mua
              </Link>
            ) : null}
          </div>
          {session.permissions.includes("supplier.account.read") ? (
            <>
              <QueryStates
                query={balance}
                loadingLabel="Đang tải công nợ"
                onRetry={() => void balance.refetch()}
              >
                {(summary) => (
                  <section className="rounded-card border border-border bg-surface p-4">
                    <h2 className="text-subheading font-semibold">Công nợ nhà cung cấp</h2>
                    <p className="text-heading font-bold">
                      {summary === null
                        ? formatMoney({ amountMinor: 0, currency: "VND" })
                        : formatMoney(summary.balance)}
                    </p>
                    <p className="text-caption text-ink-muted">
                      {summary?.classification === "supplier_credit"
                        ? "Nhà cung cấp đang giữ tiền ứng trước"
                        : summary?.classification === "payable"
                          ? "Vựa đang phải trả"
                          : "Đã cân bằng"}
                    </p>
                  </section>
                )}
              </QueryStates>
              <SupplierMoneyActions supplier={record} onChanged={refresh} />
              <QueryStates
                query={reconciliation}
                loadingLabel="Đang đối chiếu"
                onRetry={() => void reconciliation.refetch()}
              >
                {(result) => (
                  <p role="status">
                    Đối chiếu: <strong>{result.status}</strong>
                    {result.diagnostics.length === 0 ? "" : ` · ${result.diagnostics.join(", ")}`}
                  </p>
                )}
              </QueryStates>
              <section className="flex flex-col gap-3">
                <h2 className="text-subheading font-semibold">Dòng thời gian công nợ</h2>
                <QueryStates
                  query={timeline}
                  loadingLabel="Đang tải sổ công nợ"
                  onRetry={() => void timeline.refetch()}
                >
                  {() =>
                    entries.length === 0 ? (
                      <p>Chưa có phát sinh.</p>
                    ) : (
                      <ol className="flex flex-col gap-2">
                        {entries.map((entry) => {
                          const href = sourceHref(entry);
                          return (
                            <li
                              key={entry.id}
                              className="rounded-card border border-border bg-surface p-3"
                            >
                              <div className="flex justify-between gap-3">
                                <span>{entry.sourceType.replaceAll("_", " ")}</span>
                                <strong>{formatSignedMoney(entry.amount)}</strong>
                              </div>
                              <p className="text-caption text-ink-muted">
                                {formatInstant(entry.transactionTime)}
                                {entry.recordedAt === entry.transactionTime
                                  ? ""
                                  : ` · ghi ${formatInstant(entry.recordedAt)}`}
                              </p>
                              {entry.reason === null ? null : <p>{entry.reason}</p>}
                              {href === null ? null : (
                                <Link href={href} className="text-info underline">
                                  Mở chứng từ
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
                  <Button
                    tone="secondary"
                    disabled={timeline.isFetching}
                    onClick={() => setCursor(next)}
                  >
                    {timeline.isFetching ? "Đang tải" : "Tải thêm"}
                  </Button>
                )}
              </section>
            </>
          ) : null}
        </div>
      )}
    </QueryStates>
  );
}

function SupplierMoneyActions(props: { supplier: SupplierDto; onChanged: () => void }) {
  const { session } = useSession();
  const trpc = useTRPC();
  const paymentId = useRef(crypto.randomUUID()).current;
  const adjustmentId = useRef(crypto.randomUUID()).current;
  const [paymentAmount, setPaymentAmount] = useState("");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [direction, setDirection] = useState<"increase_payable" | "decrease_payable">(
    "increase_payable",
  );
  const [reasonCode, setReasonCode] = useState<
    "opening_balance" | "write_off" | "settlement" | "manual_adjustment"
  >("opening_balance");
  const [reason, setReason] = useState("");
  const paymentMutation = useMutation(trpc.supplier.recordPayment.mutationOptions());
  const adjustmentMutation = useMutation(trpc.supplier.adjustAccount.mutationOptions());
  const payment = useCommand<unknown, SupplierPaymentDto>((envelope) =>
    paymentMutation.mutateAsync(envelope as never),
  );
  const adjustment = useCommand<unknown, { adjustmentId: string }>((envelope) =>
    adjustmentMutation.mutateAsync(envelope as never),
  );
  useEffect(() => {
    if (payment.result !== null || adjustment.result !== null) props.onChanged();
  }, [adjustment.result, payment.result, props.onChanged]);
  const paymentMinor = Math.round(Number(paymentAmount) * 1000);
  const adjustmentMinor = Math.round(Number(adjustmentAmount) * 1000);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {session.permissions.includes("supplier.payment.record") ? (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-subheading font-semibold">Ghi tiền trả nhà cung cấp</h2>
          <label className="text-label">
            Số tiền (nghìn đồng)
            <input
              className={INPUT_CLASS}
              inputMode="numeric"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
          </label>
          <Button
            disabled={
              !Number.isSafeInteger(paymentMinor) ||
              paymentMinor <= 0 ||
              payment.phase.kind === "sending"
            }
            onClick={() =>
              void payment.submit({
                supplierPaymentId: paymentId,
                supplierId: props.supplier.id,
                amount: { amountMinor: paymentMinor, currency: "VND" },
                method: "cash",
                note: null,
              })
            }
          >
            Ghi thanh toán
          </Button>
          <CommandOutcome
            command={payment}
            attemptedAction="Ghi thanh toán nhà cung cấp"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
      {session.permissions.includes("supplier.account.adjust") ? (
        <section className="rounded-card border border-border bg-surface p-4">
          <h2 className="text-subheading font-semibold">Điều chỉnh công nợ</h2>
          <Select
            label="Hướng điều chỉnh"
            value={direction}
            onChange={(event) => setDirection(event.target.value as typeof direction)}
            options={[
              { value: "increase_payable", label: "Tăng phải trả" },
              { value: "decrease_payable", label: "Giảm phải trả" },
            ]}
          />
          <Select
            label="Lý do"
            value={reasonCode}
            onChange={(event) => setReasonCode(event.target.value as typeof reasonCode)}
            options={[
              { value: "opening_balance", label: "Số dư đầu kỳ" },
              { value: "write_off", label: "Xoá số dư" },
              { value: "settlement", label: "Quyết toán" },
              { value: "manual_adjustment", label: "Điều chỉnh khác" },
            ]}
          />
          <label className="text-label">
            Số tiền (nghìn đồng)
            <input
              className={INPUT_CLASS}
              inputMode="numeric"
              value={adjustmentAmount}
              onChange={(event) => setAdjustmentAmount(event.target.value)}
            />
          </label>
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
              !Number.isSafeInteger(adjustmentMinor) ||
              adjustmentMinor <= 0 ||
              reason.trim().length === 0 ||
              adjustment.phase.kind === "sending"
            }
            onClick={() =>
              void adjustment.submit({
                adjustmentId,
                supplierId: props.supplier.id,
                amount: { amountMinor: adjustmentMinor, currency: "VND" },
                direction,
                reasonCode,
                reason: reason.trim(),
              })
            }
          >
            Ghi điều chỉnh
          </Button>
          <CommandOutcome
            command={adjustment}
            attemptedAction="Điều chỉnh công nợ nhà cung cấp"
            onReload={props.onChanged}
          />
        </section>
      ) : null}
    </div>
  );
}
