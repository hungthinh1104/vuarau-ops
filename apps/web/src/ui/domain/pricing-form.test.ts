import { describe, expect, it } from "vitest";
import { PRODUCT_CA_CHUA_ID, QUALITY_GRADE_1_ID, CUSTOMER_ID } from "@vuarau/test-fixtures/ids";
import { parsePriceRuleForm, type PriceRuleFormInput } from "./pricing-form.ts";

/** TC-PRICING-006 — the Web Admin validates the pricing command fields before submit. */
const base: PriceRuleFormInput = {
  productId: PRODUCT_CA_CHUA_ID,
  qualityGradeId: QUALITY_GRADE_1_ID,
  customerId: CUSTOMER_ID,
  kind: "customer",
  unit: "kg",
  priority: "10",
  minimumQuantity: "1,5",
  effectiveFrom: "2026-08-03T08:00",
  effectiveTo: "2026-08-04T08:00",
  basePrice: "100.000",
  discount: "2.000",
  fee: "500",
  reason: "Giá khách sỉ đã chốt",
};

function parse(overrides: Partial<PriceRuleFormInput> = {}) {
  return parsePriceRuleForm({ ...base, ...overrides });
}

describe("price rule form validation", () => {
  it("returns exact scaled quantity and money adjustments for a valid rule", () => {
    const result = parse();

    expect(result).toMatchObject({
      ok: true,
      value: {
        priority: 10,
        minimumQuantityScaled: 1_500,
        baseUnitPrice: { amountMinor: 100_000, currency: "VND" },
        discountPerUnit: { amountMinor: 2_000, currency: "VND" },
        feePerUnit: { amountMinor: 500, currency: "VND" },
        reason: "Giá khách sỉ đã chốt",
      },
    });
  });

  it.each([
    ["missing product", { productId: "" }, "Chọn mặt hàng trước khi ghi quy tắc giá."],
    [
      "customer rule without customer",
      { customerId: "" },
      "Quy tắc theo khách hàng phải chọn khách hàng.",
    ],
    [
      "list rule with customer",
      { kind: "list" as const },
      "Chỉ quy tắc theo khách hàng mới được gắn khách hàng.",
    ],
    [
      "override without reason",
      { kind: "override" as const, customerId: "", reason: "" },
      "Quy tắc thay thế phải có lý do.",
    ],
  ])("refuses %s before a command is built", (_label, override, error) => {
    expect(parse(override)).toEqual({ ok: false, error });
  });

  it("bounds precedence to the command contract", () => {
    expect(parse({ priority: "1000001" })).toEqual({
      ok: false,
      error: "Độ ưu tiên phải là số nguyên từ 0 đến 1000000.",
    });
  });

  it.each([
    ["negative tier", { minimumQuantity: "-1" }, "Ngưỡng số lượng không được âm."],
    ["too precise tier", { minimumQuantity: "1,0001" }, "Tối đa 3 chữ số sau dấu phẩy."],
    ["negative discount", { discount: "-1" }, "Giá cơ sở, giảm giá và phí không được âm."],
    ["negative fee", { fee: "-1" }, "Giá cơ sở, giảm giá và phí không được âm."],
    [
      "negative final price",
      { basePrice: "100", discount: "601", fee: "0" },
      "Giảm giá không được làm giá cuối âm.",
    ],
  ])("refuses %s", (_label, override, error) => {
    expect(parse(override)).toEqual({ ok: false, error });
  });

  it("requires an ordered effective range and bounds the reason", () => {
    expect(parse({ effectiveTo: "2026-08-03T08:00" })).toEqual({
      ok: false,
      error: "Hiệu lực đến phải sau hiệu lực từ.",
    });
    expect(parse({ reason: "x".repeat(501) })).toEqual({
      ok: false,
      error: "Lý do không được dài quá 500 ký tự.",
    });
  });
});
