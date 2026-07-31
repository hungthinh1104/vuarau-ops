"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { DocumentDto, DocumentId, SaleDto, SaleId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "@/api/session-gate.tsx";
import { useTRPC } from "@/api/providers.tsx";
import { useCommand } from "@/api/use-command.ts";
import { useWorkflowMetrics } from "@/api/workflow-metrics.ts";
import { hasPermission } from "@/api/session.ts";
import { useDebounced } from "@/api/use-debounced.ts";
import { DELIVERY_STATUS_COPY, messageForCode } from "@/ui/copy.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { CorrectionTimeline } from "@/ui/patterns/sale/correction-timeline.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import {
  SaleCorrectionPanel,
  type SaleCorrectionSubmission,
} from "@/ui/patterns/sale/sale-correction-panel.tsx";
import { SaleStatus } from "@/ui/patterns/sale/sale-status.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { formatInstant, formatMoney, formatQuantity, formatRecordedGap } from "@/ui/format.ts";

/**
 * A posted sale, read back from the server, beside the account entry it created.
 *
 * The screen a worker lands on after chốt đơn, and the answer to the question the
 * pilot asks them: *"đơn này đã ghi vào sổ chưa?"* So it shows the sale **and**
 * the ledger line the sale produced, on one screen — a receipt that says "posted"
 * without showing the money moving is a receipt somebody has to take on trust.
 *
 * Nothing here is editable, and there is no control that suggests otherwise. A
 * posted sale is immutable (BR-SALE-008); a correction is a void plus a
 * replacement, which is a different screen and a different permission.
 */
export default function SaleDetailPage() {
  const { session, workspaceId } = useSession();
  const trpc = useTRPC();
  const router = useRouter();
  const params = useParams<{ saleId: string }>();
  const saleId = params.saleId as SaleId;
  const metrics = useWorkflowMetrics();

  const sale = useQuery(trpc.sale.detail.queryOptions({ workspaceId, saleId }));
  const fulfilment = useQuery({
    ...trpc.delivery.fulfilment.queryOptions({ workspaceId, saleId }),
    enabled: hasPermission(session, "delivery.read"),
  });
  const deliveries = useQuery({
    ...trpc.delivery.list.queryOptions({
      workspaceId,
      saleId,
      status: null,
      cursor: null,
      limit: 100,
    }),
    enabled: hasPermission(session, "delivery.read"),
  });
  const replacedSaleId = sale.data?.sale.replacesSaleId;
  const replacedSale = useQuery({
    ...trpc.sale.detail.queryOptions({
      workspaceId,
      saleId: replacedSaleId as SaleId,
    }),
    enabled: replacedSaleId !== null && replacedSaleId !== undefined,
    // This sale was just read before it was voided. A normal 30-second cache
    // window would show the old document without its void record on the
    // replacement page, so the correction timeline would be incomplete.
    refetchOnMount: "always",
    staleTime: 0,
  });
  const voidSale = useMutation(trpc.sale.void.mutationOptions());
  const documentMutation = useMutation(trpc.document.generate.mutationOptions());
  const [receiptDocumentId] = useState(() => crypto.randomUUID() as DocumentId);
  const receiptDocument = useCommand<unknown, DocumentDto>((envelope) =>
    documentMutation.mutateAsync(envelope as never),
  );
  const [correction, setCorrection] = useState<SaleCorrectionSubmission | null>(null);
  const [replacementCustomerQuery, setReplacementCustomerQuery] = useState("");
  const [recoveryCustomerId, setRecoveryCustomerId] = useState<string | null>(null);
  const recoveryCustomerQuery = useDebounced(replacementCustomerQuery, 200);
  const correctionCustomers = useQuery(
    trpc.customer.search.queryOptions({
      workspaceId,
      query: recoveryCustomerQuery,
      isActive: true,
      cursor: null,
      limit: 12,
    }),
  );
  const completedCorrectionRef = useRef<string | null>(null);
  const voidCommand = useCommand<
    {
      saleVoidId: string;
      saleId: string;
      reasonCode: SaleCorrectionSubmission["reasonCode"];
      reason: string;
    },
    SaleDto
  >(async (envelope) => (await voidSale.mutateAsync(envelope as never)) as SaleDto);

  useEffect(() => {
    if (sale.isSuccess) metrics.mark("sale_detail_viewed");
  }, [metrics, sale.isSuccess]);

  useEffect(() => {
    if (
      voidCommand.phase.kind !== "succeeded" ||
      voidCommand.result === null ||
      correction === null
    )
      return;
    if (completedCorrectionRef.current === voidCommand.result.id) return;
    completedCorrectionRef.current = voidCommand.result.id;
    if (correction.replacement) {
      const replacementCustomerId =
        correction.reasonCode === "wrong_customer"
          ? correction.replacementCustomerId
          : voidCommand.result.customerId;
      if (replacementCustomerId === null) return;
      router.push(
        `/customers/${replacementCustomerId}/sales/new?replacesSaleId=${voidCommand.result.id}`,
      );
      return;
    }
    void sale.refetch();
  }, [correction, router, sale, voidCommand.phase.kind, voidCommand.result]);

  useEffect(() => {
    if (receiptDocument.result !== null) router.push(`/documents/${receiptDocument.result.id}`);
  }, [receiptDocument.result, router]);

  function submitCorrection(next: SaleCorrectionSubmission): void {
    setCorrection(next);
    void voidCommand.submit({
      saleVoidId: crypto.randomUUID(),
      saleId,
      reasonCode: next.reasonCode,
      reason: next.reason,
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <QueryStates
        query={sale}
        loadingLabel="Đang tải đơn hàng"
        attemptedAction="Xem đơn hàng"
        onRetry={() => void sale.refetch()}
      >
        {(detail) => (
          <>
            <PageHeader
              title={`Đơn của ${detail.customer.displayName}`}
              description={`${detail.displayReference} · ${formatInstant(detail.sale.transactionTime)}`}
              back={{ href: "/sales", label: "Đơn hàng" }}
              status={
                <SaleStatus
                  status={detail.sale.status}
                  financialState={detail.sale.financialState}
                  dueState={detail.sale.dueState}
                  replacesSaleId={detail.sale.replacesSaleId}
                />
              }
            />

            <section className="rounded-card border border-border bg-surface p-4">
              <ul className="flex flex-col gap-2">
                {detail.sale.lines.map((line) => (
                  <li key={line.lineId} className="flex items-baseline justify-between gap-3">
                    <span className="text-body text-ink">
                      {line.productName}
                      <span className="ml-2 text-caption text-ink-muted">
                        {/* Exactly as entered. kg, bó and thùng are never
                            converted into one another (ASM-011). */}
                        {formatQuantity(line.quantity)} × {formatMoney(line.unitPrice)}
                      </span>
                    </span>
                    <span className="tabular text-body font-medium text-ink">
                      {formatMoney(line.lineTotal)}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-baseline justify-between border-t border-border pt-3">
                <span className="text-subheading font-semibold">Tổng đơn</span>
                <span className="tabular text-heading font-bold" data-testid="posted-total">
                  {formatMoney(detail.sale.totalAmount)}
                </span>
              </div>
            </section>

            {detail.sale.note !== null ? (
              <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
                {detail.sale.note}
              </p>
            ) : null}

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
              <dt className="text-ink-muted">Thời điểm bán</dt>
              <dd className="text-right text-ink">{formatInstant(detail.sale.transactionTime)}</dd>
              {formatRecordedGap(detail.sale.transactionTime, detail.sale.recordedAt) !== null ? (
                <>
                  <dt className="text-ink-muted">Ghi vào sổ</dt>
                  <dd className="text-right text-ink">{formatInstant(detail.sale.recordedAt)}</dd>
                </>
              ) : null}
            </dl>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-border py-3 text-body-sm">
              <dt className="text-ink-muted">Khách hàng</dt>
              <dd className="text-right font-medium text-ink">{detail.customer.displayName}</dd>
              <dt className="text-ink-muted">Vựa</dt>
              <dd className="text-right font-medium text-ink">{detail.workspace.name}</dd>
            </dl>
            {detail.accountEffect !== null ? (
              <section className="rounded-card border border-border bg-surface p-4">
                <h2 className="text-subheading font-semibold">Ảnh hưởng công nợ</h2>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-body-sm">
                  <dt>Công nợ trước</dt>
                  <dd className="tabular">{formatMoney(detail.accountEffect.balanceBefore)}</dd>
                  <dt>Đơn này</dt>
                  <dd className="tabular">{formatMoney(detail.accountEffect.change)}</dd>
                  <dt className="font-semibold">Công nợ mới</dt>
                  <dd className="tabular font-semibold">
                    {formatMoney(detail.accountEffect.balanceAfter)}
                  </dd>
                  <dt>Phân loại sau giao dịch</dt>
                  <dd>{detail.accountEffect.classificationAfter}</dd>
                </dl>
              </section>
            ) : null}

            {fulfilment.data !== undefined ? (
              <section className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-subheading font-semibold">Thực hiện giao hàng</h2>
                  {hasPermission(session, "delivery.create") &&
                  detail.sale.status === "posted" &&
                  fulfilment.data.lines.some(
                    (line) =>
                      line.fulfilmentState !== "attention" && line.remaining.valueScaled > 0,
                  ) ? (
                    <Link
                      href={`/sales/${saleId}/deliveries/new`}
                      className="font-semibold text-info underline-offset-4 hover:underline"
                    >
                      Tạo phiếu giao
                    </Link>
                  ) : null}
                </div>
                <ul className="mt-3 divide-y divide-border">
                  {fulfilment.data.lines.map((line) => (
                    <li key={line.saleLineId} className="grid gap-1 py-2 md:grid-cols-7">
                      <strong>
                        {line.productName} · {line.qualityGradeName ?? "Chưa phân loại"}
                      </strong>
                      <span>Đặt {formatQuantity(line.ordered)}</span>
                      <span>Đã xuất {formatQuantity(line.dispatched)}</span>
                      <span>Đã trả {formatQuantity(line.returned)}</span>
                      <span>Thực giao {formatQuantity(line.netFulfilled)}</span>
                      <span>Còn {formatQuantity(line.remaining)}</span>
                      <span>
                        {line.fulfilmentState === "fulfilled"
                          ? "Đã giao đủ"
                          : line.fulfilmentState === "attention"
                            ? `Cần xử lý: ${line.blockedReason ?? "dữ liệu không toàn vẹn"}`
                            : line.fulfilmentState.replaceAll("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {(deliveries.data?.items.length ?? 0) > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
                    {deliveries.data?.items.map((delivery) => (
                      <Link
                        key={delivery.id}
                        href={`/deliveries/${delivery.id}`}
                        className="font-semibold text-info underline-offset-4 hover:underline"
                      >
                        Phiếu {delivery.id.slice(0, 8).toUpperCase()} ·{" "}
                        {DELIVERY_STATUS_COPY[delivery.status]}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.sale.status === "posted" &&
            session.permissions.includes("document.generate") ? (
              <div>
                <Button
                  tone="secondary"
                  onClick={() =>
                    void receiptDocument.submit({
                      documentId: receiptDocumentId,
                      documentType: "sale_receipt",
                      sourceType: "sale",
                      sourceId: saleId,
                    })
                  }
                >
                  Tạo phiếu bán hàng
                </Button>
                <CommandOutcome
                  command={receiptDocument}
                  attemptedAction="Tạo phiếu bán hàng"
                  onReload={() => void sale.refetch()}
                />
              </div>
            ) : null}

            {detail.sale.replacesSaleId !== null ||
            detail.correction.voidRecord !== null ||
            detail.correction.replacedBySaleId !== null ? (
              <section className="rounded-card border border-border bg-surface p-4 text-body-sm">
                <h2 className="text-subheading font-semibold">Liên kết điều chỉnh</h2>
                {detail.sale.replacesSaleId === null || replacedSale.data !== undefined ? (
                  <CorrectionTimeline
                    sale={detail.sale}
                    replacedBySaleId={detail.correction.replacedBySaleId}
                    currentLabel={detail.displayReference}
                    {...(replacedSale.data !== undefined
                      ? { replacedSale: replacedSale.data.sale }
                      : {})}
                  />
                ) : (
                  <Link
                    href={`/sales/${detail.sale.replacesSaleId}`}
                    className="mt-3 block font-semibold text-info underline-offset-4 hover:underline"
                  >
                    Xem đơn gốc trong chuỗi điều chỉnh
                  </Link>
                )}
              </section>
            ) : null}

            {detail.sale.status === "posted" ? (
              <section className="flex flex-col gap-3">
                {hasPermission(session, "sale.void") && detail.sale.capabilities.void.allowed ? (
                  <SaleCorrectionPanel
                    onSubmit={submitCorrection}
                    originalCustomerId={detail.sale.customerId}
                    customerSearchQuery={replacementCustomerQuery}
                    customerMatches={correctionCustomers.data?.items ?? []}
                    onCustomerSearchChange={setReplacementCustomerQuery}
                    disabled={
                      voidCommand.phase.kind === "sending" || voidCommand.phase.kind === "unknown"
                    }
                  />
                ) : hasPermission(session, "sale.void") ? (
                  <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
                    {detail.sale.capabilities.void.reasonCode === undefined
                      ? "Đơn này không thể điều chỉnh."
                      : messageForCode(detail.sale.capabilities.void.reasonCode)}
                  </p>
                ) : (
                  <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
                    Bạn không có quyền điều chỉnh đơn đã chốt.
                  </p>
                )}
                <CommandOutcome
                  command={voidCommand}
                  attemptedAction="Hoàn tác đơn đã chốt"
                  onReload={() => void sale.refetch()}
                />
              </section>
            ) : null}

            {detail.sale.status === "posted" &&
            detail.correction.voidRecord !== null &&
            detail.correction.replacedBySaleId === null &&
            hasPermission(session, "sale.void") ? (
              <section className="rounded-card border border-warning/30 bg-warning-soft p-4">
                <h2 className="text-subheading font-semibold">Tiếp tục đơn thay thế</h2>
                <p className="mt-1 text-body-sm text-ink-muted">
                  Đơn gốc đã được hoàn tác. Bạn có thể tiếp tục tạo đơn thay thế sau khi tải lại
                  hoặc khi phản hồi trước đó bị gián đoạn.
                </p>
                {detail.correction.voidRecord.reasonCode === "wrong_customer" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <label className="text-label font-semibold" htmlFor="recovery-customer-search">
                      Khách hàng đúng
                    </label>
                    <input
                      id="recovery-customer-search"
                      value={replacementCustomerQuery}
                      onChange={(event) => setReplacementCustomerQuery(event.target.value)}
                      placeholder="Tìm tên hoặc số điện thoại"
                      className="min-h-11 rounded-button border border-border bg-surface px-3 text-body"
                    />
                    <div className="flex flex-wrap gap-2">
                      {(correctionCustomers.data?.items ?? [])
                        .filter((customer) => customer.id !== detail.sale.customerId)
                        .map((customer) => (
                          <Button
                            key={customer.id}
                            tone="secondary"
                            onClick={() => setRecoveryCustomerId(customer.id)}
                          >
                            {customer.displayName}
                          </Button>
                        ))}
                    </div>
                  </div>
                ) : null}
                <Button
                  className="mt-3"
                  onClick={() => {
                    const customerId =
                      detail.correction.voidRecord?.reasonCode === "wrong_customer"
                        ? recoveryCustomerId
                        : detail.sale.customerId;
                    if (customerId === null) return;
                    router.push(
                      `/customers/${customerId}/sales/new?replacesSaleId=${detail.sale.id}`,
                    );
                  }}
                  {...(detail.correction.voidRecord.reasonCode === "wrong_customer" &&
                  recoveryCustomerId === null
                    ? { disabledReason: "Chọn khách hàng đúng trước khi tiếp tục." }
                    : {})}
                >
                  Tạo đơn thay thế
                </Button>
              </section>
            ) : null}
          </>
        )}
      </QueryStates>
    </div>
  );
}
