import type {
  GoodsArrivalDto,
  QualityDispositionDto,
  QualityInspectionDto,
} from "@vuarau/domain-contracts";
import type { CustomerOrderState, SupplyCommitmentState } from "@vuarau/domain-kernel";
import { backupInteger } from "./backup-number.ts";

type BackupRow = Record<string, unknown>;

export function customerOrderLine(raw: BackupRow): CustomerOrderState["lines"][number] {
  return {
    lineId: raw["id"],
    productId: raw["productId"] ?? null,
    productName: raw["productName"],
    quantity: {
      valueScaled: backupInteger(raw["quantityScaled"], "customerOrderLines.quantityScaled"),
      unit: raw["unit"],
    },
    agreedUnitPrice:
      raw["agreedUnitPriceMinor"] == null
        ? null
        : {
            amountMinor: backupInteger(
              raw["agreedUnitPriceMinor"],
              "customerOrderLines.agreedUnitPriceMinor",
            ),
            currency: raw["currency"],
          },
    lineTotal:
      raw["lineTotalMinor"] == null
        ? null
        : {
            amountMinor: backupInteger(raw["lineTotalMinor"], "customerOrderLines.lineTotalMinor"),
            currency: raw["currency"],
          },
  } as unknown as CustomerOrderState["lines"][number];
}

export function customerOrderTotal(raw: BackupRow) {
  return raw["totalAmountMinor"] == null
    ? null
    : {
        amountMinor: backupInteger(raw["totalAmountMinor"], "customerOrders.totalAmountMinor"),
        currency: raw["currency"],
      };
}

export function supplyCommitmentLine(raw: BackupRow): SupplyCommitmentState["lines"][number] {
  return {
    lineId: raw["id"],
    productId: raw["productId"] ?? null,
    qualityGradeId: raw["qualityGradeId"] ?? null,
    productName: raw["productName"],
    quantity: {
      valueScaled: backupInteger(raw["quantityScaled"], "supplyCommitmentLines.quantityScaled"),
      unit: raw["unit"],
    },
    agreedUnitPrice:
      raw["agreedUnitPriceMinor"] == null
        ? null
        : {
            amountMinor: backupInteger(
              raw["agreedUnitPriceMinor"],
              "supplyCommitmentLines.agreedUnitPriceMinor",
            ),
            currency: raw["currency"],
          },
    lineTotal:
      raw["lineTotalMinor"] == null
        ? null
        : {
            amountMinor: backupInteger(
              raw["lineTotalMinor"],
              "supplyCommitmentLines.lineTotalMinor",
            ),
            currency: raw["currency"],
          },
  } as unknown as SupplyCommitmentState["lines"][number];
}

export function supplyCommitmentTotal(raw: BackupRow) {
  return raw["totalAmountMinor"] == null
    ? null
    : {
        amountMinor: backupInteger(raw["totalAmountMinor"], "supplyCommitments.totalAmountMinor"),
        currency: raw["currency"],
      };
}

export function goodsArrivalLine(raw: BackupRow): GoodsArrivalDto["lines"][number] {
  const weightUnit = raw["weightUnit"];
  return {
    arrivalLineId: raw["id"],
    purchaseLineId: raw["purchaseLineId"] ?? null,
    productId: raw["productId"],
    productName: raw["productName"],
    arrivedQuantity: {
      valueScaled: backupInteger(raw["arrivedValueScaled"], "goodsArrivalLines.arrivedValueScaled"),
      unit: raw["arrivedUnit"],
    },
    weighing:
      raw["grossWeightValueScaled"] == null ||
      raw["tareWeightValueScaled"] == null ||
      raw["netWeightValueScaled"] == null ||
      weightUnit == null
        ? null
        : {
            containerCount:
              raw["containerCount"] == null
                ? null
                : backupInteger(raw["containerCount"], "goodsArrivalLines.containerCount"),
            grossWeight: {
              valueScaled: backupInteger(
                raw["grossWeightValueScaled"],
                "goodsArrivalLines.grossWeightValueScaled",
              ),
              unit: weightUnit,
            },
            tareWeight: {
              valueScaled: backupInteger(
                raw["tareWeightValueScaled"],
                "goodsArrivalLines.tareWeightValueScaled",
              ),
              unit: weightUnit,
            },
            netWeight: {
              valueScaled: backupInteger(
                raw["netWeightValueScaled"],
                "goodsArrivalLines.netWeightValueScaled",
              ),
              unit: weightUnit,
            },
          },
    supplierLotCode: raw["supplierLotCode"] ?? null,
    note: raw["note"] ?? null,
  } as unknown as GoodsArrivalDto["lines"][number];
}

export function inspectedQuantity(raw: BackupRow): QualityInspectionDto["inspectedQuantity"] {
  return {
    valueScaled: backupInteger(
      raw["inspectedValueScaled"],
      "qualityInspections.inspectedValueScaled",
    ),
    unit: raw["inspectedUnit"],
  } as QualityInspectionDto["inspectedQuantity"];
}

export function dispositionAllocation(
  raw: BackupRow,
): QualityDispositionDto["allocations"][number] {
  return {
    allocationId: raw["id"],
    outcome: raw["outcome"],
    quantity: {
      valueScaled: backupInteger(raw["valueScaled"], "qualityDispositionAllocations.valueScaled"),
      unit: raw["unit"],
    },
    qualityGradeId: raw["qualityGradeId"] ?? null,
    qualityGradeName: raw["qualityGradeName"] ?? null,
    note: raw["note"] ?? null,
  } as unknown as QualityDispositionDto["allocations"][number];
}
