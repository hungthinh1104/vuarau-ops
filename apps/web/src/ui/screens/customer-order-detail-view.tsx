"use client";

import type { CustomerOrderDto } from "@vuarau/domain-contracts";
import { formatDate, formatMoney, formatQuantity } from "@/ui/format.ts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { QueryLike } from "@/ui/patterns/feedback/query-states.tsx";
import { QueryStates } from "@/ui/patterns/feedback/query-states.tsx";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader, Section } from "@/ui/patterns/layout/page-layout.tsx";
import { Badge } from "@/ui/primitives/badge.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";

const STATUS_COPY = { draft: "Nháp", confirmed: "Đã xác nhận", cancelled: "Đã huỷ" } as const;

export function CustomerOrderDetailView(props: {
  readonly query: QueryLike<CustomerOrderDto | null>;
  readonly order: CustomerOrderDto | null;
  readonly reason: string;
  readonly canConfirm: boolean;
  readonly canCancel: boolean;
  readonly confirmCommand: CommandOutcomeView;
  readonly cancelCommand: CommandOutcomeView;
  readonly onReasonChange: (value: string) => void;
  readonly onRetry: () => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <QueryStates query={props.query} loadingLabel="Đang tải đơn đặt hàng" onRetry={props.onRetry}>
      {() =>
        props.order === null ? (
          <p role="alert">Không tìm thấy đơn đặt hàng này.</p>
        ) : (
          <div className="flex max-w-4xl flex-col gap-5">
            <PageHeader
              title="Chi tiết đơn đặt hàng"
              back={{ href: "/customer-orders", label: "Đơn đặt hàng" }}
              status={
                <Badge
                  tone={
                    props.order.status === "confirmed"
                      ? "positive"
                      : props.order.status === "cancelled"
                        ? "warning"
                        : "neutral"
                  }
                >
                  {STATUS_COPY[props.order.status]}
                </Badge>
              }
              description={`${formatDate(props.order.transactionTime)} · phiên bản ${props.order.version}${props.order.customerId ? ` · khách ${props.order.customerId}` : ""}`}
            />
            <Section title="Dòng hàng" contained>
              <div className="overflow-x-auto">
                <table className="data-table w-full min-w-[620px] text-left text-body-sm">
                  <thead>
                    <tr>
                      <th className="px-3 py-2">Mặt hàng</th>
                      <th className="px-3 py-2">Số lượng</th>
                      <th className="px-3 py-2 text-right">Đơn giá</th>
                      <th className="px-3 py-2 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {props.order.lines.map((line) => (
                      <tr key={line.lineId}>
                        <td className="px-3 py-2">{line.productName}</td>
                        <td className="px-3 py-2">{formatQuantity(line.quantity)}</td>
                        <td className="px-3 py-2 text-right">
                          {line.agreedUnitPrice === null
                            ? "Chưa chốt"
                            : formatMoney(line.agreedUnitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {line.lineTotal === null ? "—" : formatMoney(line.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-right font-semibold">
                Tổng:{" "}
                {props.order.totalAmount === null
                  ? "Chưa chốt giá"
                  : formatMoney(props.order.totalAmount)}
              </p>
            </Section>
            <Section title="Snapshot thương mại" contained>
              <p className="mb-3 text-body-sm text-ink-muted">
                Đơn đặt hàng là sự thật thương mại; chưa ghi công nợ, tiền mặt hay tồn kho.
              </p>
              <dl className="grid gap-3 text-body-sm sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Kênh</dt>
                  <dd className="font-medium">{props.order.channel}</dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Điều khoản</dt>
                  <dd className="font-medium">
                    {props.order.paymentTermsSnapshot?.label ?? "Không có"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-muted">Ghi chú</dt>
                  <dd className="font-medium">{props.order.note ?? "Không có"}</dd>
                </div>
              </dl>
            </Section>
            {props.order.status === "draft" ? (
              <Section title="Chuyển trạng thái" contained>
                <div className="flex flex-col gap-3">
                  {props.canConfirm ? (
                    <Button
                      disabled={props.confirmCommand.phase.kind === "sending"}
                      onClick={props.onConfirm}
                    >
                      Xác nhận đơn đặt hàng
                    </Button>
                  ) : null}
                  {props.canCancel ? (
                    <label className="text-label">
                      Lý do huỷ
                      <Input
                        value={props.reason}
                        onChange={(event) => props.onReasonChange(event.target.value)}
                      />
                    </label>
                  ) : null}
                  {props.canCancel ? (
                    <Button
                      tone="danger"
                      disabled={
                        props.reason.trim().length === 0 ||
                        props.cancelCommand.phase.kind === "sending"
                      }
                      onClick={props.onCancel}
                    >
                      Huỷ đơn đặt hàng
                    </Button>
                  ) : null}
                  <CommandOutcome
                    command={props.confirmCommand}
                    attemptedAction="Xác nhận đơn đặt hàng"
                    onReload={props.onRetry}
                  />
                  <CommandOutcome
                    command={props.cancelCommand}
                    attemptedAction="Huỷ đơn đặt hàng"
                    onReload={props.onRetry}
                  />
                </div>
              </Section>
            ) : null}
          </div>
        )
      }
    </QueryStates>
  );
}
