import { describe, expect, it } from "vitest";
import { salePosted } from "../../fixtures/sale.fixtures.ts";
import { replacementDraftFrom } from "./replacement-sale-draft.ts";

describe("replacementDraftFrom", () => {
  it("copies a posted sale into editable manual line values without reusing its identity", () => {
    let lineNumber = 0;
    const draft = replacementDraftFrom(salePosted, () => `new-line-${++lineNumber}`);

    expect(draft.note).toBe(salePosted.note ?? "");
    expect(draft.lines).toHaveLength(salePosted.lines.length);
    expect(draft.lines[0]).toEqual({
      lineId: "new-line-1",
      productName: salePosted.lines[0]!.productName,
      quantityText: "12.5",
      unit: "kg",
      unitPriceText: "18000",
      priceOrigin: { kind: "manual" },
    });
    expect(draft.lines.map((line) => line.lineId)).not.toContain(salePosted.lines[0]!.lineId);
  });
});
