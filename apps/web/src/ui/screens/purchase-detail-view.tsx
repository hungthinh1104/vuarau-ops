"use client";

import type {
  GoodsArrivalDto,
  PurchaseDto,
  PurchaseReceiptDto,
  PurchaseReceivingSummaryDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { PURCHASE_STATUS_COPY } from "@/ui/copy.ts";
import { formatInstant, formatMoney, formatQuantity } from "@/ui/format.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PurchaseLinesSummary } from "@/ui/patterns/purchase/purchase-lines-summary.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { LinkButton } from "@/ui/primitives/link-button.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";

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

export function PurchaseDraftActionsView(props: {
  readonly purchase: PurchaseDto;
  readonly canUpdate: boolean;
  readonly canConfirm: boolean;
  readonly canDiscard: boolean;
  readonly confirmLocked: boolean;
  readonly discardLocked: boolean;
  readonly onConfirm: () => void;
  readonly onDiscard: () => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {props.canUpdate ? (
        <LinkButton tone="secondary" href={`/purchases/${props.purchase.id}/edit`}>
          Sửa đơn nháp
        </LinkButton>
      ) : null}
      {props.canConfirm ? (
        <Button disabled={props.confirmLocked} onClick={props.onConfirm}>
          {props.confirmLocked ? "Đang xác nhận" : "Xác nhận đơn mua"}
        </Button>
      ) : null}
      {props.canDiscard ? (
        <Button tone="secondary" disabled={props.discardLocked} onClick={props.onDiscard}>
          Bỏ đơn nháp
        </Button>
      ) : null}
    </div>
  );
}

export function PurchaseReceivingLoadingView() {
  return (
    <section className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-muted">
      Đang xác định luồng nhận hàng của vựa…
    </section>
  );
}

export function PurchaseCommandsFeedbackView(props: {
  readonly confirm: CommandOutcomeView;
  readonly discard: CommandOutcomeView;
  readonly onReload: () => void;
}) {
  return (
    <div className="grid gap-2">
      <CommandOutcome
        command={props.confirm}
        attemptedAction="Xác nhận đơn mua"
        onReload={props.onReload}
      />
      <CommandOutcome
        command={props.discard}
        attemptedAction="Bỏ đơn mua"
        onReload={props.onReload}
      />
    </div>
  );
}

export function PurchaseInspectedIntakeView(props: {
  readonly purchase: PurchaseDto;
  readonly arrivals: readonly GoodsArrivalDto[];
  readonly loading: boolean;
  readonly canRecord: boolean;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-subheading font-semibold">Hàng đến và kiểm định</h2>
          <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
            Luồng này chưa đưa hàng vào kho ngay. Ghi nhận hàng đến, kiểm số lượng/chất lượng, rồi
            quyết định phần chấp nhận, cách ly, từ chối hoặc hủy.
          </p>
        </div>
        {props.canRecord ? (
          <LinkButton href={`/intake/new?purchaseId=${props.purchase.id}`}>Ghi hàng đến</LinkButton>
        ) : null}
      </div>
      {props.loading ? (
        <p className="mt-4 text-body-sm text-ink-muted">Đang tải các lần hàng đến…</p>
      ) : props.arrivals.length === 0 ? (
        <p className="mt-4 text-body-sm text-ink-muted">
          Chưa có lần hàng đến nào cho đơn mua này.
        </p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {props.arrivals.map((arrival) => (
            <li key={arrival.id}>
              <Link
                href={`/intake/${arrival.id}`}
                aria-label={`Phiếu hàng đến ${arrival.id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-button border border-border px-3 py-2 hover:bg-canvas"
              >
                <span className="text-label font-semibold">
                  {arrival.vehicleReference ?? "Không ghi xe"} · {arrival.lines.length} mặt hàng
                </span>
                <span className="text-caption text-ink-muted">
                  {arrival.reversal === null ? "Đang hiệu lực" : "Đã hoàn tác"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PurchaseVoidView(props: {
  readonly state: "loading" | "error" | "blocked" | "ready";
  readonly blockedCode: string | null;
  readonly blockedReason: string | null;
  readonly voidReasonCode: string;
  readonly voidReason: string;
  readonly locked: boolean;
  readonly command: CommandOutcomeView;
  readonly onReasonCodeChange: (value: string) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onReload: () => void;
}) {
  if (props.state === "loading")
    return (
      <section className="rounded-card border border-border bg-surface p-4 text-body-sm text-ink-muted">
        Đang kiểm tra hàng thực nhận trước khi cho phép hoàn tác đơn mua…
      </section>
    );
  if (props.state === "error")
    return (
      <section
        role="alert"
        className="rounded-card border border-danger/30 bg-surface p-4 text-body-sm"
      >
        Không kiểm tra được hàng đã nhận nên chưa thể hoàn tác đơn mua. Tải lại để tránh đảo công nợ
        trong khi Goods Truth chưa rõ.
      </section>
    );
  if (props.state === "blocked")
    return (
      <section
        role="status"
        className="rounded-card border border-warning/30 bg-warning-soft p-4 text-body-sm"
      >
        <p className="font-semibold">Chưa thể hoàn tác đơn mua này</p>
        <p className="mt-1">{props.blockedReason}</p>
        {props.blockedCode === "PURCHASE_HAS_ACTIVE_RECEIPTS" ? (
          <p className="mt-2 text-ink-muted">
            Nếu phiếu nhận hàng tự nó ghi sai, hãy hoàn tác phiếu nhận đó. Nếu hàng đã thực sự được
            nhận và chỉ đơn mua thương mại bị sai, dừng ở đây và xử lý theo ASM-036; không tạo
            chuyển động kho giả để mở khóa nút này.
          </p>
        ) : null}
      </section>
    );
  return (
    <section className="rounded-card border border-warning/40 p-4">
      <h2 className="font-semibold">Hoàn tác đơn mua</h2>
      <Select
        label="Lý do"
        value={props.voidReasonCode}
        disabled={props.locked}
        onChange={(event) => props.onReasonCodeChange(event.target.value)}
        options={[
          { value: "wrong_supplier", label: "Sai nhà cung cấp" },
          { value: "wrong_product", label: "Sai mặt hàng" },
          { value: "wrong_quantity", label: "Sai số lượng" },
          { value: "wrong_price", label: "Sai giá" },
          { value: "duplicate", label: "Trùng" },
          { value: "other", label: "Khác" },
        ]}
      />
      <label className="grid gap-2 text-label">
        Giải thích
        <TextareaControl
          disabled={props.locked}
          value={props.voidReason}
          onChange={(event) => props.onReasonChange(event.target.value)}
        />
      </label>
      <Button
        tone="secondary"
        disabled={props.voidReason.trim().length === 0 || props.locked}
        onClick={props.onSubmit}
      >
        Hoàn tác đơn mua
      </Button>
      <CommandOutcome
        command={props.command}
        attemptedAction="Hoàn tác đơn mua"
        onReload={props.onReload}
      />
    </section>
  );
}

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
                  aria-label={`Phiếu nhận hàng ${item.id}`}
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
