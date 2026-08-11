import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";

type BackupRow = Record<string, unknown>;
type BackupSet = ReadonlySet<unknown>;

function rows(
  payload: WorkspaceBackupV19["payload"],
  key: "deliveries" | "deliveryLines" | "deliveryReturns",
): readonly BackupRow[] {
  const value = payload[key];
  return Array.isArray(value) ? (value as readonly BackupRow[]) : [];
}

export function deliveryReferenceValidator(payload: WorkspaceBackupV19["payload"]) {
  const deliveries = rows(payload, "deliveries");
  const deliveryLines = rows(payload, "deliveryLines");
  const deliveryReturns = rows(payload, "deliveryReturns");
  const deliveryIds = new Set(deliveries.map((row) => row["id"]));
  const deliveryLineIds = new Set(deliveryLines.map((row) => row["id"]));
  const deliveryReturnIds = new Set(deliveryReturns.map((row) => row["id"]));
  const deliverySaleById = new Map(deliveries.map((row) => [row["id"], row["saleId"]] as const));
  const saleLineSaleById = new Map(
    payload.saleLines.map((row) => [row["id"], row["saleId"]] as const),
  );
  const deliveryLineDeliveryById = new Map(
    deliveryLines.map((row) => [row["id"], row["deliveryId"]] as const),
  );
  const deliveryReturnDeliveryById = new Map(
    deliveryReturns.map((row) => [row["id"], row["deliveryId"]] as const),
  );

  return {
    validDispatchMovement(row: BackupRow): boolean {
      return (
        deliveryLineDeliveryById.has(row["sourceLineId"]) &&
        deliveryLineDeliveryById.get(row["sourceLineId"]) === row["sourceId"]
      );
    },
    validReturnMovement(row: BackupRow): boolean {
      return (
        deliveryLineDeliveryById.has(row["sourceLineId"]) &&
        deliveryReturnDeliveryById.has(row["sourceId"]) &&
        deliveryLineDeliveryById.get(row["sourceLineId"]) ===
          deliveryReturnDeliveryById.get(row["sourceId"])
      );
    },
    validDeliveryLine(row: BackupRow): boolean {
      return (
        saleLineSaleById.has(row["saleLineId"]) &&
        deliverySaleById.has(row["deliveryId"]) &&
        saleLineSaleById.get(row["saleLineId"]) === deliverySaleById.get(row["deliveryId"])
      );
    },
    validReturnLine(row: BackupRow): boolean {
      return (
        deliveryLineDeliveryById.has(row["deliveryLineId"]) &&
        deliveryReturnDeliveryById.has(row["returnId"]) &&
        deliveryLineDeliveryById.get(row["deliveryLineId"]) ===
          deliveryReturnDeliveryById.get(row["returnId"])
      );
    },
    validDeliveryRecords(references: {
      sales: BackupSet;
      products: BackupSet;
      qualityGrades: BackupSet;
    }): boolean {
      const hasGrade = (value: unknown) => value == null || references.qualityGrades.has(value);
      return (
        deliveries.every((row) => references.sales.has(row["saleId"])) &&
        deliveryLines.every(
          (row) =>
            deliveryIds.has(row["deliveryId"]) &&
            references.products.has(row["productId"]) &&
            hasGrade(row["qualityGradeId"]) &&
            this.validDeliveryLine(row),
        ) &&
        deliveryReturns.every((row) => deliveryIds.has(row["deliveryId"])) &&
        ("deliveryReturnLines" in payload
          ? payload.deliveryReturnLines.every(
              (row) =>
                deliveryReturnIds.has(row["returnId"]) &&
                deliveryLineIds.has(row["deliveryLineId"]) &&
                this.validReturnLine(row),
            )
          : true)
      );
    },
  };
}
