import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";

type BackupRow = Record<string, unknown>;

const byId = (rows: readonly BackupRow[]): ReadonlyMap<unknown, BackupRow> =>
  new Map(rows.map((row) => [row["id"], row] as const));

function currencyOf(row: BackupRow, nestedField: "amount" | "totalAmount"): unknown {
  if (typeof row["currency"] === "string") return row["currency"];
  const nested = row[nestedField];
  return typeof nested === "object" && nested !== null && "currency" in nested
    ? nested.currency
    : undefined;
}

export function paymentReferenceValidator(payload: WorkspaceBackupV19["payload"]): {
  validAllocation: (row: BackupRow) => boolean;
  validReversal: (row: BackupRow) => boolean;
} {
  const payments = byId(payload.payments);
  const sales = byId(payload.sales);
  const allocations = byId(payload.paymentAllocations ?? []);

  return {
    validAllocation(row) {
      const payment = payments.get(row["paymentId"]);
      const sale = sales.get(row["saleId"]);
      const customerId = row["customerId"];
      const currency = currencyOf(row, "amount");
      return (
        payment !== undefined &&
        sale !== undefined &&
        payment["customerId"] === customerId &&
        sale["customerId"] === customerId &&
        currencyOf(payment, "amount") === currency &&
        currencyOf(sale, "totalAmount") === currency
      );
    },
    validReversal(row) {
      const allocation = allocations.get(row["allocationId"]);
      return (
        allocation !== undefined &&
        allocation["customerId"] === row["customerId"] &&
        currencyOf(allocation, "amount") === currencyOf(row, "amount")
      );
    },
  };
}
