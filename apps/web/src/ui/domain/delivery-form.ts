import type { DeliveryLineId, SaleDetailDto, SaleFulfilmentDto } from "@vuarau/domain-contracts";
import { formatQuantityInput, parseQuantityText } from "./numeric-text.ts";

export type DeliveryLineIdFactory = (saleLineId: string) => DeliveryLineId;

/**
 * Builds only lines that can be submitted to CreateDeliveryDraft.
 *
 * A null quality grade is a valid snapshot when the workspace does not use
 * quality grading. It must not be treated as a missing product identity, and a
 * caller must never send an empty array because the command contract rejects it.
 */
export function buildDeliveryDraftLines(
  detail: SaleDetailDto,
  fulfilment: SaleFulfilmentDto,
  quantities: Readonly<Record<string, string>>,
  deliveryLineId: DeliveryLineIdFactory,
) {
  return detail.sale.lines.flatMap((line) => {
    const summary = fulfilment.lines.find((candidate) => candidate.saleLineId === line.lineId);
    if (
      line.productId === null ||
      summary === undefined ||
      summary.fulfilmentState === "attention" ||
      summary.remaining.valueScaled <= 0
    ) {
      return [];
    }

    const parsed = parseQuantityText(
      quantities[line.lineId] ?? formatQuantityInput(summary.remaining),
      line.quantity.unit,
    );
    const valueScaled = parsed.ok && parsed.value !== null ? parsed.value.valueScaled : 0;
    if (
      !Number.isSafeInteger(valueScaled) ||
      valueScaled <= 0 ||
      valueScaled > summary.remaining.valueScaled
    ) {
      return [];
    }

    return [
      {
        deliveryLineId: deliveryLineId(line.lineId),
        saleLineId: line.lineId,
        productId: line.productId,
        qualityGradeId: line.qualityGradeId,
        quantity: { valueScaled, unit: line.quantity.unit },
      },
    ];
  });
}

export function hasDeliverableLines(
  detail: SaleDetailDto,
  fulfilment: SaleFulfilmentDto,
  quantities: Readonly<Record<string, string>>,
): boolean {
  return (
    buildDeliveryDraftLines(detail, fulfilment, quantities, () => "preview" as DeliveryLineId)
      .length > 0
  );
}
