import type { SaleDto } from "@vuarau/domain-contracts";
import type { SaleLineDraft } from "./sale-line-editor.tsx";

/**
 * Turns a voided sale's immutable snapshot into a fresh, editable draft.
 *
 * The new line ids are intentionally minted by the caller: a replacement is a
 * distinct Sale, not a revision of the old document. Prices are manual because
 * they were copied from the correction source, not recalled from history.
 */
export function replacementDraftFrom(
  sale: SaleDto,
  newLineId: () => string,
): { readonly lines: readonly SaleLineDraft[]; readonly note: string } {
  return {
    lines: sale.lines.map((line) => ({
      lineId: newLineId(),
      productName: line.productName,
      quantityText: String(line.quantity.valueScaled / 1_000),
      unit: line.quantity.unit,
      unitPriceText: String(line.unitPrice.amountMinor),
      priceOrigin: { kind: "manual" },
    })),
    note: sale.note ?? "",
  };
}
