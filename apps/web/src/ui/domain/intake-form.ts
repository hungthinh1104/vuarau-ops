import type {
  GoodsArrivalLineId,
  PurchaseDto,
  RecordGoodsArrivalCommand,
} from "@vuarau/domain-contracts";

export type IntakeLineState = {
  readonly quantity: string;
  readonly gross: string;
  readonly tare: string;
  readonly containerCount: string;
  readonly supplierLotCode: string;
  readonly note: string;
};

export const EMPTY_INTAKE_LINE: IntakeLineState = {
  quantity: "",
  gross: "",
  tare: "",
  containerCount: "",
  supplierLotCode: "",
  note: "",
};

export function scaledQuantity(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const result = Math.round(parsed * 1000);
  return Number.isSafeInteger(result) ? result : null;
}

export function buildArrivalLines(
  purchaseLines: PurchaseDto["lines"],
  states: Readonly<Record<string, IntakeLineState>>,
  weighing: boolean,
  lineIds: Map<string, GoodsArrivalLineId>,
): RecordGoodsArrivalCommand["payload"]["lines"] {
  return purchaseLines.flatMap((line) => {
    const state = states[line.lineId] ?? EMPTY_INTAKE_LINE;
    const gross = scaledQuantity(state.gross);
    const tare = scaledQuantity(state.tare);
    const quantity = scaledQuantity(state.quantity) ?? line.quantity.valueScaled;
    const valueScaled = weighing
      ? gross !== null && tare !== null
        ? gross - tare
        : null
      : quantity;
    if (valueScaled === null || valueScaled <= 0) return [];
    let arrivalLineId = lineIds.get(line.lineId);
    if (arrivalLineId === undefined) {
      arrivalLineId = crypto.randomUUID() as GoodsArrivalLineId;
      lineIds.set(line.lineId, arrivalLineId);
    }
    return [
      {
        arrivalLineId,
        purchaseLineId: line.lineId,
        productId: line.productId,
        productName: line.productName,
        arrivedQuantity: { valueScaled, unit: line.quantity.unit },
        weighing: weighing
          ? {
              containerCount:
                state.containerCount.trim() === ""
                  ? null
                  : Math.max(0, Math.trunc(Number(state.containerCount))),
              grossWeight: { valueScaled: gross!, unit: line.quantity.unit },
              tareWeight: { valueScaled: tare!, unit: line.quantity.unit },
              netWeight: { valueScaled, unit: line.quantity.unit },
            }
          : null,
        supplierLotCode: state.supplierLotCode.trim() || null,
        note: state.note.trim() || null,
      },
    ];
  });
}
