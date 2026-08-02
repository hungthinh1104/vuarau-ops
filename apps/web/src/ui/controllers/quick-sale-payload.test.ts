import {
  createSaleDraftPayloadSchema,
  updateSaleDraftPayloadSchema,
} from "@vuarau/domain-contracts";
import { CUSTOMER_ID, SALE_ID } from "@vuarau/test-fixtures/ids";
import { describe, expect, it } from "vitest";
import type { ResolvedLine, SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";
import { buildQuickSalePayload } from "./quick-sale-payload.ts";

const line: SaleLineDraft = {
  lineId: "00000000-0000-4000-8000-000000000003",
  productId: null,
  productName: "Cà chua",
  qualityGradeId: null,
  qualityGradeName: null,
  quantityText: "12,5",
  unit: "kg",
  unitPriceText: "18000",
  priceOrigin: { kind: "manual" },
};

const resolved: ResolvedLine = {
  issues: {},
  quantity: { valueScaled: 12_500, unit: "kg" },
  unitPrice: { amountMinor: 18_000, currency: "VND" },
  total: { amountMinor: 225_000, currency: "VND" },
};

describe("buildQuickSalePayload", () => {
  it("builds a create payload accepted by the published sale contract", () => {
    const payload = buildQuickSalePayload({
      saleId: SALE_ID,
      customerId: CUSTOMER_ID,
      lines: [line],
      resolved: [resolved],
      note: "  Giao buổi sáng  ",
      replacesSaleId: null,
      isNew: true,
    });

    expect(createSaleDraftPayloadSchema.parse(payload)).toMatchObject({
      note: "Giao buổi sáng",
      lines: [{ productId: null, quantity: resolved.quantity, unitPrice: resolved.unitPrice }],
    });
  });

  it("omits create-only fields when updating an existing draft", () => {
    const payload = buildQuickSalePayload({
      saleId: SALE_ID,
      customerId: CUSTOMER_ID,
      lines: [line],
      resolved: [resolved],
      note: "",
      replacesSaleId: null,
      isNew: false,
    });

    expect(updateSaleDraftPayloadSchema.parse(payload)).toMatchObject({
      saleId: SALE_ID,
      note: null,
    });
    expect(payload).not.toHaveProperty("customerId");
    expect(payload).not.toHaveProperty("replacesSaleId");
  });
});
