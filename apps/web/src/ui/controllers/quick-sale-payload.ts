import type { CustomerId, SaleDto, SaleLineId, QualityGradeId } from "@vuarau/domain-contracts";
import type { ResolvedLine, SaleLineDraft } from "@/ui/patterns/sale/sale-line-editor.tsx";

export function buildQuickSalePayload(args: {
  readonly saleId: SaleDto["id"];
  readonly customerId: CustomerId;
  readonly lines: readonly SaleLineDraft[];
  readonly resolved: readonly ResolvedLine[];
  readonly note: string;
  readonly replacesSaleId: string | null;
  readonly isNew: boolean;
}) {
  return {
    saleId: args.saleId,
    ...(args.isNew ? { customerId: args.customerId, currency: "VND" as const } : {}),
    lines: args.lines.map((line, index) => ({
      lineId: line.lineId as SaleLineId,
      /*
       * A catalog choice carries its real id; free text carries null.
       * `productName`, unit and price remain the immutable Sale snapshot
       * (BR-SALE-011 / ADR-0017). Never mint a product id for free text.
       */
      productId: line.productId ?? null,
      productName: line.productName.trim(),
      qualityGradeId: (line.qualityGradeId ?? null) as QualityGradeId | null,
      qualityGradeName: line.qualityGradeName ?? null,
      quantity: args.resolved[index]!.quantity,
      unitPrice: args.resolved[index]!.unitPrice,
    })),
    note: args.note.trim().length === 0 ? null : args.note.trim(),
    dueAt: null,
    ...(args.isNew ? { replacesSaleId: args.replacesSaleId as SaleDto["id"] | null } : {}),
  };
}
