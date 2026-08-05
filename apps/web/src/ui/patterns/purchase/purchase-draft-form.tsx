"use client";

import type { ReactNode } from "react";
import { UNIT_LABEL_VI, UNITS, type Unit } from "@vuarau/domain-contracts";
import type {
  PurchaseDraftLine,
  PurchaseProductOption,
  PurchaseSupplierOption,
} from "@/ui/domain/purchase-form.ts";
import { Button } from "@/ui/primitives/button.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { Textarea } from "@/ui/primitives/textarea.tsx";
import { ActionDock } from "@/ui/patterns/layout/action-dock.tsx";
import { PageHeader } from "@/ui/patterns/layout/page-layout.tsx";

export function PurchaseDraftForm(props: {
  readonly title: string;
  readonly description?: string;
  readonly back: { readonly href: string; readonly label: string };
  readonly supplierId: string;
  readonly suppliers?: readonly PurchaseSupplierOption[];
  readonly supplierSearch?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
  };
  readonly supplierDisabled?: boolean;
  readonly lines: readonly PurchaseDraftLine[];
  readonly products: readonly PurchaseProductOption[];
  readonly productsLoading?: boolean;
  readonly productSearch?: {
    readonly value: string;
    readonly onChange: (value: string) => void;
  };
  readonly note: string;
  readonly evidence: string;
  readonly valid: boolean;
  readonly submitLabel: string;
  readonly submitting: boolean;
  readonly addLineDisabled?: boolean;
  readonly actionButtons?: ReactNode;
  readonly primaryAction?: ReactNode | undefined;
  readonly secondaryActions?: ReactNode | undefined;
  readonly feedback?: ReactNode;
  readonly onSupplierChange?: (supplierId: string) => void;
  readonly onLineChange: (
    lineId: PurchaseDraftLine["lineId"],
    patch: Partial<PurchaseDraftLine>,
  ) => void;
  readonly onAddLine: () => void;
  readonly onRemoveLine: (lineId: PurchaseDraftLine["lineId"]) => void;
  readonly onNoteChange: (note: string) => void;
  readonly onEvidenceChange: (evidence: string) => void;
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
          {...(props.supplierSearch === undefined
            ? {}
            : {
                searchValue: props.supplierSearch.value,
                onSearchChange: props.supplierSearch.onChange,
                searchPlaceholder: "Tên hoặc số điện thoại nhà cung cấp",
              })}
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
          className="grid gap-3 rounded-card border border-border bg-surface p-4 grid-cols-1 md:grid-cols-3 lg:grid-cols-6"
        >
          <legend className="px-2 font-semibold">Dòng {index + 1}</legend>
          <Select
            label="Mặt hàng"
            value={line.productId}
            disabled={props.productsLoading === true && props.products.length === 0}
            {...(props.productSearch === undefined
              ? {}
              : {
                  searchValue: props.productSearch.value,
                  onSearchChange: props.productSearch.onChange,
                  searchPlaceholder: "Tên hoặc mã mặt hàng",
                })}
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
          <TextInput
            label="Số lượng"
            inputMode="decimal"
            value={line.quantity}
            onChange={(event) => props.onLineChange(line.lineId, { quantity: event.target.value })}
          />
          <Select
            label="Đơn vị"
            value={line.unit}
            onChange={(event) =>
              props.onLineChange(line.lineId, { unit: event.target.value as Unit })
            }
            options={UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }))}
          />
          <TextInput
            label="Đơn giá (kđ)"
            inputMode="numeric"
            value={line.price}
            onChange={(event) => props.onLineChange(line.lineId, { price: event.target.value })}
          />
          <div className="flex items-end pb-0.5">
            <Button
              tone="secondary"
              disabled={props.lines.length === 1}
              onClick={() => props.onRemoveLine(line.lineId)}
              fullWidth
            >
              Xoá dòng
            </Button>
          </div>
        </fieldset>
      ))}
      <Button tone="secondary" disabled={props.addLineDisabled} onClick={props.onAddLine}>
        Thêm dòng
      </Button>
      <Textarea
        label="Ghi chú"
        value={props.note}
        onChange={(event) => props.onNoteChange(event.target.value)}
      />
      <Textarea
        label="Ảnh hoặc phiếu liên quan (mỗi dòng một tham chiếu)"
        hint="Chỉ lưu liên kết nguồn; không tự tạo hiệu ứng tiền, công nợ hoặc tồn kho."
        rows={3}
        value={props.evidence}
        onChange={(event) => props.onEvidenceChange(event.target.value)}
      />
      <ActionDock
        label="Hành động đơn mua"
        summary={
          <div>
            <p className="text-caption font-semibold text-ink-muted">Dữ liệu đơn mua</p>
            <p className="text-body-sm font-semibold text-ink">Kiểm tra trước khi lưu</p>
          </div>
        }
        secondary={
          <>
            {props.primaryAction === undefined ? null : (
              <Button
                tone="secondary"
                disabled={!props.valid || props.submitting}
                onClick={props.onSubmit}
              >
                {props.submitLabel}
              </Button>
            )}
            {props.secondaryActions ?? props.actionButtons}
          </>
        }
        primary={
          props.primaryAction ?? (
            <Button disabled={!props.valid || props.submitting} onClick={props.onSubmit}>
              {props.submitLabel}
            </Button>
          )
        }
        feedback={props.feedback}
      />
    </div>
  );
}
