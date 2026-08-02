"use client";

import type { ReactNode } from "react";
import { UNIT_LABEL_VI, UNITS, type Unit } from "@vuarau/domain-contracts";
import type {
  PurchaseDraftLine,
  PurchaseProductOption,
  PurchaseSupplierOption,
} from "@/ui/domain/purchase-form.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { Input } from "@/ui/primitives/input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextareaControl } from "@/ui/primitives/textarea-control.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function PurchaseDraftForm(props: {
  readonly title: string;
  readonly description?: string;
  readonly back: { readonly href: string; readonly label: string };
  readonly supplierId: string;
  readonly suppliers?: readonly PurchaseSupplierOption[];
  readonly supplierDisabled?: boolean;
  readonly lines: readonly PurchaseDraftLine[];
  readonly products: readonly PurchaseProductOption[];
  readonly productsLoading?: boolean;
  readonly note: string;
  readonly valid: boolean;
  readonly submitLabel: string;
  readonly submitting: boolean;
  readonly addLineDisabled?: boolean;
  readonly feedback?: ReactNode;
  readonly onSupplierChange?: (supplierId: string) => void;
  readonly onLineChange: (
    lineId: PurchaseDraftLine["lineId"],
    patch: Partial<PurchaseDraftLine>,
  ) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (lineId: PurchaseDraftLine["lineId"]) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onSubmit: () => void;
}) {
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <PageHeader
        title={props.title}
        back={props.back}
        {...(props.description !== undefined ? { description: props.description } : {})}
      />
      {props.suppliers !== undefined && props.onSupplierChange !== undefined ? (
        <Select
          label="Nhà cung cấp"
          value={props.supplierId}
          disabled={props.supplierDisabled}
          onChange={(event) => props.onSupplierChange?.(event.target.value)}
          placeholder="Chọn nhà cung cấp đang hoạt động"
          options={props.suppliers.map((supplier) => ({
            value: supplier.id,
            label: supplier.displayName,
          }))}
        />
      ) : null}
      {props.lines.map((line, index) => (
        <fieldset
          key={line.lineId}
          className="grid gap-3 rounded-card border border-border bg-surface p-4 md:grid-cols-5"
        >
          <legend className="px-2 font-semibold">Dòng {index + 1}</legend>
          <Select
            label="Mặt hàng"
            value={line.productId}
            disabled={props.productsLoading}
            onChange={(event) => {
              const product = props.products.find((item) => item.id === event.target.value);
              if (product === undefined) return;
              props.onLineChange(line.lineId, {
                productId: product.id,
                productName: product.displayName,
                unit: product.preferredUnit ?? line.unit,
              });
            }}
            placeholder="Chọn mặt hàng"
            options={props.products.map((product) => ({
              value: product.id,
              label: product.displayName,
            }))}
          />
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
            onChange={(event) =>
              props.onLineChange(line.lineId, { unit: event.target.value as Unit })
            }
            options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
          />
          <label className="text-label">
            Đơn giá (nghìn đồng)
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
      <Button tone="secondary" disabled={props.addLineDisabled} onClick={props.onAddLine}>
        Thêm dòng
      </Button>
      <label className="text-label">
        Ghi chú
        <TextareaControl
          value={props.note}
          onChange={(event) => props.onNoteChange(event.target.value)}
        />
      </label>
      <Button disabled={!props.valid || props.submitting} onClick={props.onSubmit}>
        {props.submitLabel}
      </Button>
      {props.feedback}
    </div>
  );
}
