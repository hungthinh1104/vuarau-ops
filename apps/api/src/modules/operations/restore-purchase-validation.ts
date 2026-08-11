import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";

type BackupRow = Record<string, unknown>;
type BackupSet = ReadonlySet<unknown>;

function rows(
  payload: WorkspaceBackupV19["payload"],
  key: "purchases" | "purchaseLines" | "receipts" | "receiptLines" | "receiptReversals",
): readonly BackupRow[] {
  const value = payload[key];
  return Array.isArray(value) ? (value as readonly BackupRow[]) : [];
}

export function purchaseReferenceValidator(payload: WorkspaceBackupV19["payload"]) {
  const purchases = rows(payload, "purchases");
  const purchaseLines = rows(payload, "purchaseLines");
  const receipts = rows(payload, "receipts");
  const receiptLines = rows(payload, "receiptLines");
  const receiptReversals = rows(payload, "receiptReversals");
  const purchaseIds = new Set(purchases.map((row) => row["id"]));
  const purchaseLineIds = new Set(purchaseLines.map((row) => row["id"] ?? row["lineId"]));
  const receiptIds = new Set(receipts.map((row) => row["id"]));
  const purchaseLinePurchaseById = new Map(
    purchaseLines.map((row) => [row["id"] ?? row["lineId"], row["purchaseId"]] as const),
  );
  const purchaseLineProductById = new Map(
    purchaseLines.map((row) => [row["id"] ?? row["lineId"], row["productId"]] as const),
  );
  const receiptPurchaseById = new Map(
    receipts.map((row) => [row["id"], row["purchaseId"]] as const),
  );
  const receiptLineReceiptById = new Map(
    receiptLines.map((row) => [row["id"], row["receiptId"]] as const),
  );
  const reversalReceiptById = new Map(
    receiptReversals.map((row) => [row["id"], row["receiptId"]] as const),
  );

  return {
    validReceiptLine(row: BackupRow): boolean {
      const receiptId = row["receiptId"];
      const purchaseLineId = row["purchaseLineId"];
      return (
        receiptPurchaseById.has(receiptId) &&
        purchaseLinePurchaseById.has(purchaseLineId) &&
        purchaseLineProductById.get(purchaseLineId) === row["productId"] &&
        receiptPurchaseById.get(receiptId) === purchaseLinePurchaseById.get(purchaseLineId)
      );
    },
    validReceiptMovement(row: BackupRow): boolean {
      const receiptId =
        row["sourceType"] === "purchase_receipt"
          ? row["sourceId"]
          : reversalReceiptById.get(row["sourceId"]);
      return (
        receiptId !== undefined &&
        receiptLineReceiptById.has(row["sourceLineId"]) &&
        receiptLineReceiptById.get(row["sourceLineId"]) === receiptId
      );
    },
    validReceiptRecords(references: { products: BackupSet; qualityGrades: BackupSet }): boolean {
      const hasGrade = (value: unknown) => value == null || references.qualityGrades.has(value);
      return (
        receipts.every((row) => purchaseIds.has(row["purchaseId"])) &&
        receiptLines.every(
          (row) =>
            receiptIds.has(row["receiptId"]) &&
            purchaseLineIds.has(row["purchaseLineId"]) &&
            references.products.has(row["productId"]) &&
            hasGrade(row["qualityGradeId"]) &&
            this.validReceiptLine(row),
        ) &&
        receiptReversals.every((row) => receiptIds.has(row["receiptId"]))
      );
    },
  };
}
