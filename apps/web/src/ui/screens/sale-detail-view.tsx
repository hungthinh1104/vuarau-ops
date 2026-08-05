"use client";

import type {
  DeliveryDto,
  SaleDetailDto,
  SaleDto,
  SaleFulfilmentDto,
} from "@vuarau/domain-contracts";
import Link from "next/link";
import type { ReactNode } from "react";
import { DELIVERY_STATUS_COPY, copyForBlockedReason, messageForCode } from "@/ui/copy.ts";
import { formatInstant, formatMoney, formatQuantity, formatRecordedGap } from "@/ui/format.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { SourceEvidenceList } from "@/ui/patterns/evidence/source-evidence-list.tsx";
import {
  SaleCorrectionPanel,
  type SaleCorrectionSubmission,
} from "@/ui/patterns/sale/sale-correction-panel.tsx";
import { CorrectionTimeline } from "@/ui/patterns/sale/correction-timeline.tsx";
import { SaleStatus } from "@/ui/patterns/sale/sale-status.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import {
  DetailLayout,
  PageFrame,
  PageHeader,
  SummaryRail,
} from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

export type SaleDetailViewProps = {
  readonly detail: SaleDetailDto;
  readonly fulfilment?: SaleFulfilmentDto;
  readonly deliveries?: readonly DeliveryDto[];
  readonly replacedSale?: SaleDto;
  readonly canGenerateDocument: boolean;
  readonly documentLocked: boolean;
  readonly correctionSection?: ReactNode;
  readonly recoverySection?: ReactNode;
  readonly feedback?: ReactNode;
  readonly onGenerateDocument: () => void;
};

export function SaleCorrectionSectionView(props: {
  readonly sale: SaleDto;
  readonly canVoid: boolean;
  readonly voidAllowed: boolean;
  readonly voidReasonCode: SaleDto["capabilities"]["void"]["reasonCode"];
  readonly goodsReturnStatus: "blocked" | "safe" | "unknown";
  readonly customerSearchQuery: string;
  readonly customerMatches: readonly { readonly id: string; readonly displayName: string }[];
  readonly command: CommandOutcomeView;
  readonly disabled: boolean;
  readonly onSubmit: (correction: SaleCorrectionSubmission) => void;
  readonly onCustomerSearchChange: (value: string) => void;
  readonly onReload: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      {props.canVoid && props.voidAllowed ? (
        <SaleCorrectionPanel
          onSubmit={props.onSubmit}
          goodsReturnStatus={props.goodsReturnStatus}
          originalCustomerId={props.sale.customerId}
          customerSearchQuery={props.customerSearchQuery}
          customerMatches={props.customerMatches}
          onCustomerSearchChange={props.onCustomerSearchChange}
          disabled={props.disabled}
        />
      ) : (
        <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
          {props.canVoid
            ? props.voidReasonCode === undefined
              ? "Đơn này không thể điều chỉnh."
              : messageForCode(props.voidReasonCode)
            : "Bạn không có quyền điều chỉnh đơn đã chốt."}
        </p>
      )}
      <CommandOutcome
        command={props.command}
        attemptedAction="Hoàn tác đơn đã chốt"
        onReload={props.onReload}
      />
    </section>
  );
}

export function SaleReplacementRecoveryView(props: {
  readonly sale: SaleDto;
  readonly query: string;
  readonly customerMatches: readonly { readonly id: string; readonly displayName: string }[];
  readonly selectedCustomerId: string | null;
  readonly onQueryChange: (value: string) => void;
  readonly onSelectCustomer: (customerId: string) => void;
  readonly onContinue: (customerId: string) => void;
}) {
  const voidRecord = props.sale.voidRecord;
  if (voidRecord === null) return null;
  const wrongCustomer = voidRecord.reasonCode === "wrong_customer";
  const customerId = wrongCustomer ? props.selectedCustomerId : props.sale.customerId;
  return (
    <section className="rounded-card border border-warning/30 bg-warning-soft p-4">
      <h2 className="text-subheading font-semibold">Tiếp tục đơn thay thế</h2>
      <p className="mt-1 text-body-sm text-ink-muted">
        Đơn gốc đã được hoàn tác. Có thể tiếp tục tạo đơn thay thế sau khi tải lại hoặc khi phản hồi
        trước đó bị gián đoạn.
      </p>
      {wrongCustomer ? (
        <div className="mt-3 flex flex-col gap-2">
          <label className="text-label font-semibold" htmlFor="recovery-customer-search">
            Khách hàng đúng
          </label>
          <Input
            id="recovery-customer-search"
            value={props.query}
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder="Tìm tên hoặc số điện thoại"
          />
          <div className="flex flex-wrap gap-2">
            {props.customerMatches
              .filter((customer) => customer.id !== props.sale.customerId)
              .map((customer) => (
                <Button
                  key={customer.id}
                  tone="secondary"
                  onClick={() => props.onSelectCustomer(customer.id)}
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
          if (customerId !== null) props.onContinue(customerId);
        }}
        {...(customerId === null
          ? { disabledReason: "Chọn khách hàng đúng trước khi tiếp tục." }
          : {})}
      >
        Tạo đơn thay thế
      </Button>
    </section>
  );
}

export function SaleDetailView({
  detail,
  fulfilment,
  deliveries = [],
  replacedSale,
  canGenerateDocument,
  documentLocked,
  correctionSection,
  recoverySection,
  feedback,
  onGenerateDocument,
}: SaleDetailViewProps) {
  const { sale } = detail;
  const mayCreateDelivery =
    fulfilment?.capabilities.createDelivery.allowed === true &&
    fulfilment.lines.some(
      (line) => line.fulfilmentState !== "attention" && line.remaining.valueScaled > 0,
    ) === true;

  return (
    <PageFrame size="standard">
      <DetailLayout
        aside={
          <SummaryRail title="Tóm tắt đơn bán">
            <dl className="grid gap-2 text-body-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Tổng đơn</dt>
                <dd className="tabular font-semibold">{formatMoney(sale.totalAmount)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Khách hàng</dt>
                <dd className="max-w-[10rem] text-right font-semibold">
                  {detail.customer.displayName}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-ink-muted">Phiếu giao</dt>
                <dd className="tabular font-semibold">{deliveries.length}</dd>
              </div>
            </dl>
          </SummaryRail>
        }
      >
        <div className="flex flex-col gap-6">
          <PageHeader
            title={`Đơn của ${detail.customer.displayName}`}
            description={`${detail.displayReference} · ${formatInstant(sale.transactionTime)}`}
            back={{ href: "/sales", label: "Đơn hàng" }}
            status={
              <SaleStatus
                status={sale.status}
                financialState={sale.financialState}
                dueState={sale.dueState}
                replacesSaleId={sale.replacesSaleId}
              />
            }
          />

          <SaleMoneyTruth detail={detail} />

          {fulfilment === undefined ? null : (
            <SaleFulfilmentSection
              sale={sale}
              fulfilment={fulfilment}
              deliveries={deliveries}
              mayCreateDelivery={mayCreateDelivery}
            />
          )}

          {sale.status === "posted" && canGenerateDocument ? (
            <ActionDock
              label="Hành động đơn bán"
              summary={<p className="text-body-sm font-semibold text-ink">Đơn đã chốt</p>}
              primary={
                <Button tone="secondary" disabled={documentLocked} onClick={onGenerateDocument}>
                  {documentLocked ? "Đang chuẩn bị đơn bán" : "Mở đơn bán"}
                </Button>
              }
            />
          ) : null}

          {sale.replacesSaleId !== null ||
          detail.correction.voidRecord !== null ||
          detail.correction.replacedBySaleId !== null ? (
            <CorrectionLinks
              detail={detail}
              {...(replacedSale === undefined ? {} : { replacedSale })}
            />
          ) : null}

          {correctionSection}
          {recoverySection}
          {feedback}
        </div>
      </DetailLayout>
    </PageFrame>
  );
}

function SaleMoneyTruth({ detail }: { readonly detail: SaleDetailDto }) {
  const { sale } = detail;
  return (
    <>
      <section className="rounded-card border border-border bg-surface p-4">
        <ul className="flex flex-col gap-2">
          {sale.lines.map((line) => (
            <li key={line.lineId} className="flex items-baseline justify-between gap-3">
              <span className="text-body text-ink">
                {line.productName}
                {line.qualityGradeName === null ? null : (
                  <span className="ml-1 text-caption text-ink-muted">
                    · {line.qualityGradeName}
                  </span>
                )}
                <span className="ml-2 text-caption text-ink-muted">
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
            {formatMoney(sale.totalAmount)}
          </span>
        </div>
      </section>

      {sale.note === null ? null : (
        <p className="border-l-2 border-border-strong pl-3 text-body-sm text-ink-muted">
          {sale.note}
        </p>
      )}
      <SourceEvidenceList references={sale.evidenceReferences} />

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-body-sm">
        <dt className="text-ink-muted">Thời điểm bán</dt>
        <dd className="text-right text-ink">{formatInstant(sale.transactionTime)}</dd>
        {formatRecordedGap(sale.transactionTime, sale.recordedAt) === null ? null : (
          <>
            <dt className="text-ink-muted">Ghi vào sổ</dt>
            <dd className="text-right text-ink">{formatInstant(sale.recordedAt)}</dd>
          </>
        )}
      </dl>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-y border-border py-3 text-body-sm">
        <dt className="text-ink-muted">Khách hàng</dt>
        <dd className="text-right font-medium text-ink">{detail.customer.displayName}</dd>
        <dt className="text-ink-muted">Vựa</dt>
        <dd className="text-right font-medium text-ink">{detail.workspace.name}</dd>
      </dl>

      {detail.accountEffect === null ? null : (
        <section
          aria-labelledby="sale-account-effect-title"
          className="rounded-card border border-border bg-surface p-4"
        >
          <h2 id="sale-account-effect-title" className="text-subheading font-semibold">
            Ảnh hưởng công nợ
          </h2>
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
            <dd>{balanceClassificationCopy(detail.accountEffect.classificationAfter)}</dd>
          </dl>
        </section>
      )}
    </>
  );
}

function SaleFulfilmentSection(props: {
  readonly sale: SaleDto;
  readonly fulfilment: SaleFulfilmentDto;
  readonly deliveries: readonly DeliveryDto[];
  readonly mayCreateDelivery: boolean;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-subheading font-semibold">Thực hiện giao hàng</h2>
          <p className="text-body-sm text-ink-muted">
            Chốt đơn ghi công nợ; xuất kho mới làm giảm tồn kho và bắt đầu giao hàng.
          </p>
        </div>
        {props.mayCreateDelivery ? (
          <Link
            href={`/sales/${props.sale.id}/deliveries/new`}
            className="font-semibold text-info underline-offset-4 hover:underline"
          >
            Giao đơn
          </Link>
        ) : null}
      </div>

      {!props.fulfilment.capabilities.createDelivery.allowed &&
      props.fulfilment.capabilities.createDelivery.reasonCode ===
        "DELIVERY_REPLACEMENT_FULFILMENT_BLOCKED" ? (
        <p
          role="status"
          className="mt-3 rounded-card border border-warning/30 bg-warning-soft p-3 text-body-sm"
        >
          Đơn này thay thế một đơn đã có hàng thực giao. Hệ thống không tạo đơn giao mới vì như vậy
          sẽ ghi nhận hàng đi lần hai. Giữ nguyên lịch sử giao hàng cũ và xử lý theo quy trình điều
          chỉnh sau giao theo quy trình đã được phê duyệt.
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-border">
        {props.fulfilment.lines.map((line) => (
          <li
            key={line.saleLineId}
            className="grid gap-2 py-3 lg:grid-cols-[minmax(12rem,2fr)_repeat(5,1fr)_minmax(9rem,1.2fr)]"
          >
            <strong>
              {line.productName} · {line.qualityGradeName ?? "Chưa phân loại"}
            </strong>
            <span>Đặt {formatQuantity(line.ordered)}</span>
            <span>Đã xuất {formatQuantity(line.dispatched)}</span>
            <span>Đã trả {formatQuantity(line.returned)}</span>
            <span>Thực giao {formatQuantity(line.netFulfilled)}</span>
            <span className="font-semibold">Còn {formatQuantity(line.remaining)}</span>
            <FulfilmentState state={line.fulfilmentState} blockedReason={line.blockedReason} />
          </li>
        ))}
      </ul>

      {props.deliveries.length === 0 ? null : (
        <div className="mt-3 flex flex-wrap gap-3 border-t border-border pt-3">
          {props.deliveries.map((delivery) => (
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
      )}
    </section>
  );
}

function FulfilmentState(props: {
  readonly state: SaleFulfilmentDto["lines"][number]["fulfilmentState"];
  readonly blockedReason: string | null;
}) {
  if (props.state === "attention") {
    return (
      <span className="text-warning">
        Cần kiểm tra: {copyForBlockedReason(props.blockedReason)}
      </span>
    );
  }
  const copy = {
    unfulfilled: "Chưa giao",
    partially_fulfilled: "Giao một phần",
    fulfilled: "Đã giao đủ",
    returned_partial: "Có hàng trả lại",
  } as const;
  const tone =
    props.state === "fulfilled"
      ? "positive"
      : props.state === "unfulfilled"
        ? "neutral"
        : "warning";
  return <Badge tone={tone}>{copy[props.state]}</Badge>;
}

function CorrectionLinks(props: {
  readonly detail: SaleDetailDto;
  readonly replacedSale?: SaleDto;
}) {
  const sale = props.detail.sale;
  return (
    <section className="rounded-card border border-border bg-surface p-4 text-body-sm">
      <h2 className="text-subheading font-semibold">Liên kết điều chỉnh</h2>
      {sale.replacesSaleId === null || props.replacedSale !== undefined ? (
        <CorrectionTimeline
          sale={sale}
          replacedBySaleId={props.detail.correction.replacedBySaleId}
          currentLabel={props.detail.displayReference}
          {...(props.replacedSale === undefined ? {} : { replacedSale: props.replacedSale })}
        />
      ) : (
        <Link
          href={`/sales/${sale.replacesSaleId}`}
          className="mt-3 block font-semibold text-info underline-offset-4 hover:underline"
        >
          Xem đơn gốc trong chuỗi điều chỉnh
        </Link>
      )}
    </section>
  );
}

function balanceClassificationCopy(
  value: SaleDetailDto["accountEffect"] extends infer T
    ? NonNullable<T> extends { classificationAfter: infer C }
      ? C
      : never
    : never,
): string {
  switch (value) {
    case "receivable":
      return "Khách còn nợ";
    case "settled":
      return "Đã cân công nợ";
    case "customer_credit":
      return "Khách đang có tiền dư";
  }
}
