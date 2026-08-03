import type {
  CustomerId,
  Money,
  PriceRuleKind,
  ProductId,
  QualityGradeId,
  Unit,
} from "@vuarau/domain-contracts";
import { parseMoneyText, parseQuantityText } from "./numeric-text.ts";

const MAX_PRICE_RULE_PRIORITY = 1_000_000;

export type PriceRuleFormInput = {
  readonly productId: string;
  readonly qualityGradeId: string;
  readonly customerId: string;
  readonly kind: PriceRuleKind;
  readonly unit: Unit;
  readonly priority: string;
  readonly minimumQuantity: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string;
  readonly basePrice: string;
  readonly discount: string;
  readonly fee: string;
  readonly reason: string;
};

export type ParsedPriceRuleForm = {
  readonly productId: ProductId;
  readonly qualityGradeId: QualityGradeId | null;
  readonly customerId: CustomerId | null;
  readonly kind: PriceRuleKind;
  readonly unit: Unit;
  readonly priority: number;
  readonly minimumQuantityScaled: number;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly baseUnitPrice: Money;
  readonly discountPerUnit: Money;
  readonly feePerUnit: Money;
  readonly reason: string | null;
};

export type PriceRuleFormResult =
  | { readonly ok: true; readonly value: ParsedPriceRuleForm }
  | { readonly ok: false; readonly error: string };

function parseInteger(raw: string, label: string): { value: number } | { error: string } {
  const value = Number(raw.trim());
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_PRICE_RULE_PRIORITY
    ? { value }
    : { error: `${label} phải là số nguyên từ 0 đến ${MAX_PRICE_RULE_PRIORITY}.` };
}

function parseInstant(raw: string, label: string): { value: string } | { error: string } {
  const date = new Date(raw);
  return Number.isNaN(date.getTime())
    ? { error: `${label} không hợp lệ.` }
    : { value: date.toISOString() };
}

/**
 * Validates every field the pricing screen can send before it creates a command.
 * The server remains authoritative; this keeps obvious precedence, tier, money,
 * fee and override errors from becoming a round trip or a misleading preview.
 */
export function parsePriceRuleForm(input: PriceRuleFormInput): PriceRuleFormResult {
  if (input.productId.length === 0) {
    return { ok: false, error: "Chọn mặt hàng trước khi ghi rule." };
  }
  if (input.kind === "customer" && input.customerId.length === 0) {
    return { ok: false, error: "Rule theo khách hàng phải chọn khách hàng." };
  }
  if (input.kind !== "customer" && input.customerId.length > 0) {
    return { ok: false, error: "Chỉ rule theo khách hàng mới được gắn khách hàng." };
  }

  const base = parseMoneyText(input.basePrice, "VND");
  const discount = parseMoneyText(input.discount, "VND");
  const fee = parseMoneyText(input.fee, "VND");
  if (!base.ok || !discount.ok || !fee.ok) {
    return {
      ok: false,
      error:
        [base, discount, fee].find((result) => !result.ok)?.reason ?? "Kiểm tra các trường tiền.",
    };
  }
  if (base.value === null || discount.value === null || fee.value === null) {
    return { ok: false, error: "Giá cơ sở, giảm giá và phí phải có giá trị." };
  }
  if (base.value.amountMinor < 0 || discount.value.amountMinor < 0 || fee.value.amountMinor < 0) {
    return { ok: false, error: "Giá cơ sở, giảm giá và phí không được âm." };
  }
  if (base.value.amountMinor - discount.value.amountMinor + fee.value.amountMinor < 0) {
    return { ok: false, error: "Giảm giá không được làm giá cuối âm." };
  }

  const quantity = parseQuantityText(input.minimumQuantity, input.unit);
  if (!quantity.ok || quantity.value === null) {
    return { ok: false, error: quantity.ok ? "Ngưỡng số lượng phải có giá trị." : quantity.reason };
  }
  if (quantity.value.valueScaled < 0) {
    return { ok: false, error: "Ngưỡng số lượng không được âm." };
  }

  const priority = parseInteger(input.priority, "Độ ưu tiên");
  if ("error" in priority) return { ok: false, error: priority.error };

  const from = parseInstant(input.effectiveFrom, "Hiệu lực từ");
  if ("error" in from) return { ok: false, error: from.error };
  const to =
    input.effectiveTo.trim().length === 0 ? null : parseInstant(input.effectiveTo, "Hiệu lực đến");
  if (to !== null && "error" in to) return { ok: false, error: to.error };
  if (to !== null && to.value <= from.value) {
    return { ok: false, error: "Hiệu lực đến phải sau hiệu lực từ." };
  }

  const reason = input.reason.trim();
  if (input.kind === "override" && reason.length === 0) {
    return { ok: false, error: "Rule override phải có lý do." };
  }
  if (reason.length > 500) {
    return { ok: false, error: "Lý do không được dài quá 500 ký tự." };
  }

  return {
    ok: true,
    value: {
      productId: input.productId as ProductId,
      qualityGradeId:
        input.qualityGradeId.length === 0 ? null : (input.qualityGradeId as QualityGradeId),
      customerId: input.customerId.length === 0 ? null : (input.customerId as CustomerId),
      kind: input.kind,
      unit: input.unit,
      priority: priority.value,
      minimumQuantityScaled: quantity.value.valueScaled,
      effectiveFrom: from.value,
      effectiveTo: to === null ? null : to.value,
      baseUnitPrice: base.value,
      discountPerUnit: discount.value,
      feePerUnit: fee.value,
      reason: reason.length === 0 ? null : reason,
    },
  };
}
