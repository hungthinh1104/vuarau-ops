import type { WorkspaceBackupV19 } from "@vuarau/domain-contracts";

type BackupRow = Record<string, unknown>;

const byId = (rows: readonly BackupRow[]): ReadonlyMap<unknown, BackupRow> =>
  new Map(rows.map((row) => [row["id"], row] as const));

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
      const currency = row["currency"];
      return (
        payment !== undefined &&
        sale !== undefined &&
        payment["customerId"] === customerId &&
        sale["customerId"] === customerId &&
        payment["currency"] === currency &&
        sale["currency"] === currency
      );
    },
    validReversal(row) {
      const allocation = allocations.get(row["allocationId"]);
      return (
        allocation !== undefined &&
        allocation["customerId"] === row["customerId"] &&
        allocation["currency"] === row["currency"]
      );
    },
  };
}
