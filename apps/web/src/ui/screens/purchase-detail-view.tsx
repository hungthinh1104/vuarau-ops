"use client";

import type {
  PurchaseDto,
  PurchaseReceiptDto,
  PurchaseReceivingSummaryDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { PURCHASE_STATUS_COPY } from "@/ui/copy.ts";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { PurchaseLinesSummary } from "@/ui/patterns/purchase/purchase-lines-summary.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";

export type PurchaseDetailViewProps = {
  readonly purchase: PurchaseDto;
  readonly receipts: readonly PurchaseReceiptDto[];
  readonly receivingSummary: PurchaseReceivingSummaryDto["lines"];
  readonly receiptsLoading: boolean;
  readonly canCreateReplacement: boolean;
  readonly canReverseReceipt: boolean;
  readonly draftActions?: ReactNode;
  readonly receivingPanel?: ReactNode;
  readonly reversalPanel?: ReactNode;
  readonly voidPanel?: ReactNode;
  readonly feedback?: ReactNode;
  readonly onReverseReceipt: (receiptId: PurchaseReceiptDto["id"]) => void;
};

export function PurchaseDetailView({
  purchase,
  receipts,
  receivingSummary,
  receiptsLoading,
  canCreateReplacement,
  canReverseReceipt,
  draftActions,
  receivingPanel,
  reversalPanel,
  voidPanel,
  feedback,
  onReverseReceipt,
}: PurchaseDetailViewProps) {
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Đơn mua"
        description={`Mã ${purchase.id.slice(0, 8).toUpperCase()} · ${formatInstant(purchase.transactionTime)}${
          purchase.recordedAt === purchase.transactionTime
            ? ""
            : ` · ghi ${formatInstant(purchase.recordedAt)}`
        }`}
        back={{ href: "/purchases", label: "Đơn mua" }}
        status={
          <Badge
            tone={
              purchase.voidRecord !== null
                ? "warning"
                : purchase.status === "confirmed"
                  ? "positive"
                  : "neutral"
            }
          >
            {purchase.voidRecord !== null ? "Đã hoàn tác" : PURCHASE_STATUS_COPY[purchase.status]}
          </Badge>
        }
      />

      <Link
        href={`/suppliers/${purchase.supplierId}`}
        className="font-semibold text-info underline-offset-4 hover:underline"
      >
        Mở nhà cung cấp
      </Link>

      <PurchaseLinesSummary purchase={purchase} />

      <section className="border-y border-border py-3 text-body-sm">
        <p className="font-semibold">Ý nghĩa hiện tại</p>
        <p className="mt-1 text-ink-muted">
          Xác nhận đơn mua là commercial/money truth theo chính sách hiện tại; hàng chỉ vào tồn khi
          có Phiếu nhận. Hai thời điểm này không được gộp thành một trạng thái.
        </p>
      </section>

      {purchase.replacesPurchaseId === null ? null : (
        <p>
          Thay thế{" "}
          <Link
            href={`/purchases/${purchase.replacesPurchaseId}`}
            className="font-semibold text-info underline-offset-4 hover:underline"
          >
            đơn mua trước
          </Link>
          .
        </p>
      )}

      {purchase.voidRecord === null ? null : (
        <section className="rounded-card border border-warning/40 bg-warning-soft p-4">
          <h2 className="font-semibold">Đơn mua đã được hoàn tác</h2>
          <p className="mt-1 text-body-sm">
            {purchase.voidRecord.reasonCode}: {purchase.voidRecord.reason}
          </p>
          <p className="mt-1 font-semibold tabular-nums">
            {formatMoney(purchase.voidRecord.amount)}
          </p>
          {canCreateReplacement ? (
            <Link
              href={`/purchases/new?replacesPurchaseId=${purchase.id}`}
              className="mt-2 inline-block font-semibold text-info underline-offset-4 hover:underline"
            >
              Tạo đơn mua thay thế
            </Link>
          ) : null}
        </section>
      )}

      {draftActions}
      {receivingPanel}

      <ReceivingHistory
        summary={receivingSummary}
        receipts={receipts}
        loading={receiptsLoading}
        canReverse={canReverseReceipt}
        onReverse={onReverseReceipt}
      />

      {reversalPanel}
      {voidPanel}
      {feedback}
    </div>
  );
}

function ReceivingHistory(props: {
  readonly summary: PurchaseReceivingSummaryDto["lines"];
  readonly receipts: readonly PurchaseReceiptDto[];
  readonly loading: boolean;
  readonly canReverse: boolean;
  readonly onReverse: (receiptId: PurchaseReceiptDto["id"]) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-subheading font-semibold">Phiếu nhận hàng</h2>
        <p className="text-body-sm text-ink-muted">
          Tổng nhận là physical truth riêng; hoàn tác phiếu nhận không sửa lại đơn mua gốc.
        </p>
      </div>

      {props.summary.length === 0 ? null : (
        <ul className="divide-y divide-border rounded-card border border-border bg-surface">
          {props.summary.map((line) => (
            <li key={line.purchaseLineId} className="px-3 py-2">
              <strong>{line.productName}</strong>: đặt {formatQuantity(line.ordered)} · đã nhận{" "}
              {formatQuantity(line.received)} · còn lại {formatQuantity(line.remaining)}
            </li>
          ))}
        </ul>
      )}

      {props.loading ? (
        <p className="text-body-sm text-ink-muted">Đang tải phiếu nhận…</p>
      ) : props.receipts.length === 0 ? (
        <p className="text-body-sm text-ink-muted">Chưa ghi nhận hàng vào kho.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {props.receipts.map((item) => (
            <li key={item.id} className="grid gap-2 border-t border-border py-3 first:border-t-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/receipts/${item.id}`}
                  className="font-semibold text-info underline-offset-4 hover:underline"
                >
                  {formatInstant(item.transactionTime)}
                </Link>
                {item.reversal === null ? null : <Badge tone="warning">Đã hoàn tác</Badge>}
              </div>
              <ul className="text-body-sm text-ink-muted">
                {item.lines.map((line) => (
                  <li key={line.receiptLineId}>
                    {props.summary.find((summary) => summary.purchaseLineId === line.purchaseLineId)
                      ?.productName ?? "Mặt hàng"}{" "}
                    · {line.qualityGradeName ?? "Chưa phân loại"} · {formatQuantity(line.quantity)}
                  </li>
                ))}
              </ul>
              {item.reversal === null && props.canReverse ? (
                <div>
                  <Button tone="secondary" onClick={() => props.onReverse(item.id)}>
                    Hoàn tác phiếu nhận
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
