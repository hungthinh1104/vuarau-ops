"use client";

import type { CustomerOrderChannel, ProductId } from "@vuarau/domain-contracts";
import type { CommandOutcomeView } from "@/ui/domain/command-state.ts";
import type { CustomerOrderDraftLine } from "@/ui/domain/customer-order-form.ts";
import { CommandOutcome } from "@/ui/patterns/feedback/command-outcome.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { UNIT_LABEL_VI, UNITS, type Unit } from "@vuarau/domain-contracts";

const CHANNELS: readonly { value: CustomerOrderChannel; label: string }[] = [
  { value: "account_customer", label: "Khách công nợ" },
  { value: "contract_customer", label: "Khách hợp đồng" },
  { value: "walk_in", label: "Khách lẻ" },
  { value: "internal_transfer", label: "Điều chuyển nội bộ" },
];

export function CustomerOrderCreateView(props: {
  readonly channel: CustomerOrderChannel;
  readonly customerId: string;
  readonly customers: readonly { id: string; displayName: string }[];
  readonly products: readonly { id: ProductId; displayName: string; preferredUnit: Unit | null }[];
  readonly lines: readonly CustomerOrderDraftLine[];
  readonly note: string;
  readonly dueAt: string;
  readonly valid: boolean;
  readonly command: CommandOutcomeView;
  readonly submitting: boolean;
  readonly canCreate: boolean;
  readonly onChannelChange: (value: string) => void;
  readonly onCustomerChange: (value: string) => void;
  readonly onLineChange: (
    lineId: CustomerOrderDraftLine["lineId"],
    patch: Partial<CustomerOrderDraftLine>,
  ) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (lineId: CustomerOrderDraftLine["lineId"]) => void;
  readonly onNoteChange: (value: string) => void;
  readonly onDueAtChange: (value: string) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  if (!props.canCreate) return <p role="alert">Bạn không có quyền tạo đơn đặt hàng.</p>;
  const needsCustomer =
    props.channel === "account_customer" || props.channel === "contract_customer";
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Tạo đơn đặt hàng"
        back={{ href: "/customer-orders", label: "Đơn đặt hàng" }}
        description="Đơn đặt hàng là sự thật thương mại; chưa ghi công nợ, tiền mặt hay tồn kho."
      />
      <Select
        label="Kênh đơn"
        value={props.channel}
        options={CHANNELS}
        onChange={(event) => props.onChannelChange(event.target.value)}
      />
      {needsCustomer ? (
        <Select
          label="Khách hàng"
          value={props.customerId}
          placeholder="Chọn khách hàng"
          options={props.customers.map((customer) => ({
            value: customer.id,
            label: customer.displayName,
          }))}
          onChange={(event) => props.onCustomerChange(event.target.value)}
        />
      ) : null}
      {props.lines.map((line, index) => (
        <fieldset
          key={line.lineId}
          className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-5"
        >
          <legend className="px-2 font-semibold">Dòng {index + 1}</legend>
          <Select
            label="Mặt hàng trong danh mục"
            value={line.productId}
            placeholder="Có thể để trống ở bản nháp"
            options={props.products.map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
            onChange={(event) => {
              const product = props.products.find((item) => item.id === event.target.value);
              if (product === undefined) return;
              props.onLineChange(line.lineId, {
                productId: product.id,
                productName: product.displayName,
                unit: product.preferredUnit ?? line.unit,
              });
            }}
          />
          <label className="text-label">
            Tên mặt hàng ghi nhận
            <Input
              value={line.productName}
              onChange={(event) =>
                props.onLineChange(line.lineId, { productName: event.target.value })
              }
            />
          </label>
          <label className="text-label">
            Số lượng
            <Input
              inputMode="decimal"
              value={line.quantity}
              onChange={(event) =>
                props.onLineChange(line.lineId, { quantity: event.target.value })
              }
            />
          </label>
          <Select
            label="Đơn vị"
            value={line.unit}
            options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
            onChange={(event) =>
              props.onLineChange(line.lineId, { unit: event.target.value as Unit })
            }
          />
          <label className="text-label">
            Đơn giá (nghìn đồng, có thể để trống)
            <Input
              inputMode="numeric"
              value={line.price}
              onChange={(event) => props.onLineChange(line.lineId, { price: event.target.value })}
            />
          </label>
          <Button
            tone="secondary"
            disabled={props.lines.length === 1}
            onClick={() => props.onRemoveLine(line.lineId)}
          >
            Xoá dòng
          </Button>
        </fieldset>
      ))}
      <Button tone="secondary" onClick={props.onAddLine}>
        Thêm dòng
      </Button>
      <label className="text-label">
        Hạn thanh toán dự kiến (không bắt buộc)
        <Input
          type="date"
          value={props.dueAt}
          onChange={(event) => props.onDueAtChange(event.target.value)}
        />
      </label>
      <Textarea
        label="Ghi chú"
        value={props.note}
        onChange={(event) => props.onNoteChange(event.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Button disabled={!props.valid || props.submitting} onClick={props.onSave}>
          {props.submitting ? "Đang lưu" : "Lưu đơn đặt hàng"}
        </Button>
        <Button tone="secondary" disabled={props.submitting} onClick={props.onCancel}>
          Huỷ
        </Button>
      </div>
      <CommandOutcome
        command={props.command}
        attemptedAction="Lưu đơn đặt hàng"
        onReload={() => undefined}
        onCancel={props.onCancel}
      />
    </div>
  );
}
