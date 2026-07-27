"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { SaleDto, SaleId } from "@vuarau/domain-contracts";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "../../../../api/session-gate.tsx";
import { useTRPC } from "../../../../api/providers.tsx";
import { useCommand } from "../../../../api/use-command.ts";
import { useWorkflowMetrics } from "../../../../api/workflow-metrics.ts";
import { hasPermission } from "../../../../api/session.ts";
import { messageForCode } from "../../../../ui/copy.ts";
import { CommandOutcome } from "../../../../ui/patterns/command-outcome.tsx";
import { CorrectionTimeline } from "../../../../ui/patterns/correction-timeline.tsx";
import { QueryStates } from "../../../../ui/patterns/query-states.tsx";
import {
  SaleCorrectionPanel,
  type SaleCorrectionSubmission,
} from "../../../../ui/patterns/sale-correction-panel.tsx";
import { SaleStatus } from "../../../../ui/patterns/sale-status.tsx";
import {
  formatInstant,
  formatMoney,
  formatQuantity,
  formatRecordedGap,
} from "../../../../ui/format.ts";

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
  const replacedSaleId = sale.data?.sale.replacesSaleId;
  const replacedSale = useQuery({
    ...trpc.sale.detail.queryOptions({
      workspaceId,
      saleId: replacedSaleId as SaleId,
    }),
    enabled: replacedSaleId !== null && replacedSaleId !== undefined,
  });
  const voidSale = useMutation(trpc.sale.void.mutationOptions());
  const [correction, setCorrection] = useState<SaleCorrectionSubmission | null>(null);
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
      router.push(
        `/customers/${voidCommand.result.customerId}/sales/new?replacesSaleId=${voidCommand.result.id}`,
      );
      return;
    }
    void sale.refetch();
  }, [correction, router, sale, voidCommand.phase.kind, voidCommand.result]);

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
    <div className="flex flex-col gap-5">
      <QueryStates
        query={sale}
        loadingLabel="Đang tải đơn hàng"
        attemptedAction="Xem đơn hàng"
        onRetry={() => void sale.refetch()}
      >
        {(detail) => (
          <>
            <div className="flex flex-col gap-2">
              <h1 className="text-heading font-bold">CHI TIẾT ĐƠN · {detail.displayReference}</h1>
              <SaleStatus
                status={detail.sale.status}
                financialState={detail.sale.financialState}
                dueState={detail.sale.dueState}
                replacesSaleId={detail.sale.replacesSaleId}
              />
            </div>

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
              <p className="rounded-card bg-surface-muted px-4 py-3 text-body-sm text-ink">
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

            <section className="rounded-card border border-border bg-surface p-4 text-body-sm">
              <p>
                Khách hàng: <strong>{detail.customer.displayName}</strong>
              </p>
              <p>
                Tên vựa: <strong>{detail.workspace.name}</strong>
              </p>
            </section>
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
                    className="mt-3 block text-info underline"
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
                    disabled={
                      voidCommand.phase.kind === "sending" || voidCommand.phase.kind === "unknown"
                    }
                  />
                ) : hasPermission(session, "sale.void") ? (
                  <p className="rounded-card border border-border bg-surface-muted p-4 text-body-sm text-ink-muted">
                    {detail.sale.capabilities.void.reasonCode === undefined
                      ? "Đơn này không thể điều chỉnh."
                      : messageForCode(detail.sale.capabilities.void.reasonCode)}
                  </p>
                ) : (
                  <p className="rounded-card border border-border bg-surface-muted p-4 text-body-sm text-ink-muted">
                    Bạn không có quyền điều chỉnh đơn đã chốt.
                  </p>
                )}
                <CommandOutcome
                  command={voidCommand}
                  attemptedAction="Void đơn đã chốt"
                  onReload={() => void sale.refetch()}
                />
              </section>
            ) : null}

            <Link
              href={`/customers/${detail.sale.customerId}`}
              className="touch-target inline-flex items-center justify-center rounded-button border border-border bg-surface px-4 text-label font-semibold text-ink hover:border-border-strong"
            >
              Xem sổ công nợ khách hàng
            </Link>
          </>
        )}
      </QueryStates>
    </div>
  );
}
