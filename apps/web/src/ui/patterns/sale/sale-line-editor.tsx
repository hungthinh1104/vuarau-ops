"use client";

import type { Money, ProductId, QualityGradeId, Quantity, Unit } from "@vuarau/domain-contracts";
import { UNITS, UNIT_LABEL_VI, calculateLineTotal } from "@vuarau/domain-contracts";
import { Button } from "@/ui/primitives/button.tsx";
import { IconButton } from "@/ui/primitives/icon-button.tsx";
import { MoneyInput } from "@/ui/primitives/money-input.tsx";
import { QuantityInput } from "@/ui/primitives/quantity-input.tsx";
import { Select } from "@/ui/primitives/select.tsx";
import { TextInput } from "@/ui/primitives/text-input.tsx";
import { parseMoneyText, parseQuantityText } from "@/ui/domain/numeric-text.ts";
import { Search, X } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";
import { formatMoney } from "@/ui/format.ts";

/**
 * One line of a sale, held as **raw text**.
 *
 * Nothing here is a parsed number, and that is what makes "entered lines survive
 * a server rejection" structural rather than a habit: there is no value to
 * convert back from, so nothing can be lost on the way. A worker who has typed
 * three lines and meets a refusal still has three lines.
 */
export type SaleLineDraft = {
  readonly lineId: string;
  readonly productId?: ProductId | null;
  readonly productName: string;
  readonly qualityGradeId?: QualityGradeId | null;
  readonly qualityGradeName?: string | null;
  readonly quantityText: string;
  readonly unit: Unit;
  readonly unitPriceText: string;
  /** UI-only provenance; the posted Sale always snapshots the visible price. */
  readonly priceOrigin:
    | { readonly kind: "manual" }
    | {
        readonly kind: "recalled";
        readonly sourceSaleId: string;
        readonly productName: string;
        readonly unit: Unit;
      }
    | null;
};

export function emptyLine(lineId: string): SaleLineDraft {
  return {
    lineId,
    productId: null,
    productName: "",
    qualityGradeId: null,
    qualityGradeName: null,
    quantityText: "",
    unit: "kg",
    unitPriceText: "",
    priceOrigin: null,
  };
}

export type SaleLineIssue = {
  readonly productName?: string;
  readonly quantity?: string;
  readonly unitPrice?: string;
};

/**
 * What a line resolves to, or why it does not.
 *
 * Validation mirrors BR-SALE-003 — a name, a quantity above zero, a price that
 * is not negative — and it is here so the worker is told before the round trip.
 * The server checks the same things again from the aggregate it loads, and its
 * answer is the one that decides.
 */
export type ResolvedLine = {
  readonly issues: SaleLineIssue;
  /** Null when the text does not resolve; the issues say why. */
  readonly quantity: Quantity | null;
  readonly unitPrice: Money | null;
  readonly total: Money | null;
};

export function resolveLine(line: SaleLineDraft): ResolvedLine {
  const issues: { productName?: string; quantity?: string; unitPrice?: string } = {};

  if (line.productName.trim().length === 0) {
    issues.productName = "Nhập tên mặt hàng.";
  }

  const quantity = parseQuantityText(line.quantityText, line.unit);
  if (!quantity.ok) {
    issues.quantity = quantity.reason;
  } else if (quantity.value === null) {
    issues.quantity = "Nhập số lượng.";
  } else if (quantity.value.valueScaled <= 0) {
    issues.quantity = `Số lượng phải lớn hơn 0 ${UNIT_LABEL_VI[line.unit]}.`;
  }

  const price = parseMoneyText(line.unitPriceText, "VND");
  if (!price.ok) {
    issues.unitPrice = price.reason;
  } else if (price.value === null) {
    issues.unitPrice = "Nhập đơn giá.";
  } else if (price.value.amountMinor < 0) {
    issues.unitPrice = "Đơn giá không được âm.";
  }

  const resolvedQuantity = quantity.ok ? quantity.value : null;
  const resolvedPrice = price.ok ? price.value : null;
  const resolvable =
    Object.keys(issues).length === 0 && resolvedQuantity !== null && resolvedPrice !== null;

  return {
    issues,
    quantity: resolvedQuantity,
    unitPrice: resolvedPrice,
    // `calculateLineTotal` comes from `domain-contracts` — the same
    // implementation the server posts with (BR-SALE-004). A second copy here
    // would be a number read aloud to the customer and a different number they
    // are charged.
    total: resolvable ? calculateLineTotal(resolvedQuantity, resolvedPrice) : null,
  };
}

const UNIT_OPTIONS = UNITS.map((unit) => ({ value: unit, label: UNIT_LABEL_VI[unit] }));

export type SaleLineEditorProps = {
  readonly line: SaleLineDraft;
  readonly index: number;
  readonly issues: SaleLineIssue;
  /** Server-side line refusal for this row, e.g. `SALE_LINE_INVALID`. */
  readonly serverIssue?: string;
  readonly onChange: (
    line: SaleLineDraft,
    field: "product" | "qualityGrade" | "quantity" | "unit" | "unitPrice",
  ) => void;
  readonly onRemove: () => void;
  readonly canRemove: boolean;
  readonly onFocus?: () => void;
  /** A durably queued offline snapshot is immutable until server confirmation. */
  readonly disabled?: boolean;
  readonly qualityGradeOptions?: readonly {
    readonly value: string;
    readonly label: string;
  }[];
  readonly onOpenProductPicker?: () => void;
};

/**
 * A phone-first row: name, then quantity and unit side by side, then price.
 *
 * That order is the order a market trader says it — "cà chua, mười hai ký rưỡi,
 * mười tám nghìn" — so the fields are filled in the sequence they are spoken and
 * Tab moves the way the sentence does.
 *
 * Units are never converted. A bó of rau muống has no fixed mass, and the depot
 * prices per unit as sold (ASM-011), so the unit is carried exactly as chosen and
 * displayed exactly as entered.
 */
export function SaleLineEditor({
  line,
  index,
  issues,
  serverIssue,
  onChange,
  onRemove,
  canRemove,
  onFocus,
  disabled = false,
  qualityGradeOptions = [],
  onOpenProductPicker,
  onAdvance,
}: SaleLineEditorProps & { readonly onAdvance?: () => void }) {
  const { total } = resolveLine(line);
  const rowRef = useRef<HTMLLIElement>(null);

  const isFulfilmentReady =
    line.productId !== null &&
    line.productId !== undefined &&
    line.qualityGradeId !== null &&
    line.qualityGradeId !== undefined &&
    line.qualityGradeName !== null &&
    line.qualityGradeName !== undefined &&
    total !== null;

  function focusRowField(field: string): void {
    rowRef.current?.querySelector<HTMLElement>(`[data-sale-field="${field}"]`)?.focus();
  }

  function focusField(event: KeyboardEvent<HTMLElement>, field: string): void {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    focusRowField(field);
  }

  return (
    <li
      ref={rowRef}
      data-testid={`sale-line-${index}`}
      className="rounded-card border border-border bg-surface p-3 sm:p-4"
      onFocus={onFocus}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-caption font-semibold uppercase tracking-wide text-ink-muted">
            Dòng {index + 1}
          </span>
          <p className="tabular mt-0.5 text-subheading font-semibold text-ink">
            {total === null ? "Chưa đủ dữ liệu" : formatMoney(total)}
          </p>
        </div>
        {canRemove ? (
          <IconButton label={`Xoá dòng ${index + 1}`} onClick={onRemove} disabled={disabled}>
            <X size={16} />
          </IconButton>
        ) : null}
      </div>

      <div className="grid gap-3">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              label="Mặt hàng"
              required
              placeholder="Nhập hoặc chọn mặt hàng"
              disabled={disabled}
              value={line.productName}
              data-sale-field="product"
              onKeyDown={(event) => focusField(event, "qualityGrade")}
              onChange={(event) =>
                onChange({ ...line, productName: event.target.value }, "product")
              }
              {...(issues.productName !== undefined ? { error: issues.productName } : {})}
            />
          </div>
          {onOpenProductPicker !== undefined ? (
            <Button
              tone="secondary"
              className="shrink-0 px-3"
              disabled={disabled}
              onClick={onOpenProductPicker}
              type="button"
              aria-label="Mở bảng chọn mặt hàng và giá gần đây"
              title="Chọn mặt hàng"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              <span className="hidden sm:inline">Chọn</span>
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Select
              label="Phân hạng chất lượng"
              required
              disabled={disabled}
              value={line.qualityGradeId ?? ""}
              placeholder="Chọn hạng"
              data-sale-field="qualityGrade"
              onChange={(event) => {
                const option = qualityGradeOptions.find(
                  (candidate) => candidate.value === event.target.value,
                );
                onChange(
                  {
                    ...line,
                    qualityGradeId: (event.target.value || null) as QualityGradeId | null,
                    qualityGradeName: option?.label ?? null,
                  },
                  "qualityGrade",
                );
                if (option !== undefined) {
                  requestAnimationFrame(() => focusRowField("quantity"));
                }
              }}
              options={qualityGradeOptions}
            />
          </div>
          <QuantityInput
            label="Số lượng"
            required
            disabled={disabled}
            unit={line.unit}
            unitLabel={UNIT_LABEL_VI[line.unit]}
            showUnitSuffix={false}
            value={line.quantityText}
            data-sale-field="quantity"
            onKeyDown={(event) => focusField(event, "price")}
            onChange={(event) =>
              onChange({ ...line, quantityText: event.target.value }, "quantity")
            }
            {...(issues.quantity !== undefined ? { error: issues.quantity } : {})}
          />
          <Select
            label="Đơn vị"
            disabled={disabled}
            value={line.unit}
            onChange={(event) => onChange({ ...line, unit: event.target.value as Unit }, "unit")}
            options={UNIT_OPTIONS}
          />
          <div className="col-span-2 md:col-span-1">
            <MoneyInput
              label="Đơn giá"
              required
              disabled={disabled}
              currency="VND"
              value={line.unitPriceText}
              data-sale-field="price"
              enterKeyHint="next"
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                if (isFulfilmentReady) {
                  onAdvance?.();
                }
              }}
              onChange={(event) =>
                onChange({ ...line, unitPriceText: event.target.value }, "unitPrice")
              }
              {...(issues.unitPrice !== undefined ? { error: issues.unitPrice } : {})}
            />
          </div>
        </div>
      </div>

      {serverIssue !== undefined ? (
        <p role="alert" className="mt-3 text-caption text-danger">
          {serverIssue}
        </p>
      ) : null}
    </li>
  );
}
