"use client";

import type { Money, ProductId, QualityGradeId, Quantity, Unit } from "@vuarau/domain-contracts";
import { UNITS, UNIT_LABEL_VI, calculateLineTotal } from "@vuarau/domain-contracts";
import { IconButton } from "../primitives/icon-button.tsx";
import { MoneyInput } from "../primitives/money-input.tsx";
import { QuantityInput } from "../primitives/quantity-input.tsx";
import { Select } from "../primitives/select.tsx";
import { TextInput } from "../primitives/text-input.tsx";
import { parseMoneyText, parseQuantityText } from "../primitives/numeric-text.ts";
import { formatMoney } from "../format.ts";

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
}: SaleLineEditorProps) {
  const { total } = resolveLine(line);

  return (
    <li
      data-testid={`sale-line-${index}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-3"
      onFocus={onFocus}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-caption font-semibold text-ink-muted">Dòng {index + 1}</span>
        {canRemove ? (
          <IconButton label={`Xoá dòng ${index + 1}`} onClick={onRemove} disabled={disabled}>
            ✕
          </IconButton>
        ) : null}
      </div>

      <TextInput
        label="Mặt hàng"
        required
        placeholder="Nhập hoặc chọn mặt hàng"
        disabled={disabled}
        value={line.productName}
        onChange={(event) => onChange({ ...line, productName: event.target.value }, "product")}
        {...(issues.productName !== undefined ? { error: issues.productName } : {})}
      />

      <Select
        label="Phân hạng chất lượng"
        required
        disabled={disabled}
        value={line.qualityGradeId ?? ""}
        placeholder="Chọn phân hạng"
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
        }}
        options={qualityGradeOptions}
      />

      <div className="grid grid-cols-2 gap-3">
        <QuantityInput
          label="Số lượng"
          required
          disabled={disabled}
          unit={line.unit}
          value={line.quantityText}
          onChange={(event) => onChange({ ...line, quantityText: event.target.value }, "quantity")}
          {...(issues.quantity !== undefined ? { error: issues.quantity } : {})}
        />
        <Select
          label="Đơn vị"
          disabled={disabled}
          value={line.unit}
          onChange={(event) => onChange({ ...line, unit: event.target.value as Unit }, "unit")}
          options={UNIT_OPTIONS}
        />
      </div>

      <MoneyInput
        label="Đơn giá"
        required
        disabled={disabled}
        currency="VND"
        value={line.unitPriceText}
        onChange={(event) => onChange({ ...line, unitPriceText: event.target.value }, "unitPrice")}
        {...(issues.unitPrice !== undefined ? { error: issues.unitPrice } : {})}
      />

      {serverIssue !== undefined ? (
        // The server refused *this* row. `SALE_LINE_INVALID` carries `lineIndex`,
        // so the message belongs here and nowhere else.
        <p role="alert" className="text-caption text-danger">
          {serverIssue}
        </p>
      ) : null}

      <div className="flex items-baseline justify-between border-t border-border pt-2">
        <span className="text-body-sm text-ink-muted">Thành tiền</span>
        <span className="tabular text-subheading font-semibold text-ink">
          {total === null ? "—" : formatMoney(total)}
        </span>
      </div>
    </li>
  );
}
