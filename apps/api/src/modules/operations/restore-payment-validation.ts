import type { WorkspaceBackupV23 } from "@vuarau/domain-contracts";

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

export function paymentReferenceValidator(payload: WorkspaceBackupV23["payload"]): {
  validAllocation: (row: BackupRow) => boolean;
  validReversal: (row: BackupRow) => boolean;
  validCreditPreservation: (row: BackupRow) => boolean;
  validLineageForCustomers: (customerIds: ReadonlySet<unknown>) => boolean;
} {
  const payments = byId(payload.payments);
  const sales = byId(payload.sales);
  const allocations = byId(payload.paymentAllocations ?? []);
  const preservations = byId(payload.customerPaymentCreditPreservations ?? []);

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
    validCreditPreservation(row) {
      const payment = payments.get(row["paymentId"]);
      const caseKind = row["caseKind"];
      const relatedPreservationId = row["relatedPreservationId"];
      return (
        payment !== undefined &&
        payment["customerId"] === row["customerId"] &&
        currencyOf(payment, "amount") === currencyOf(row, "amount") &&
        ((caseKind === "preservation" && relatedPreservationId == null) ||
          (caseKind === "correction" &&
            relatedPreservationId != null &&
            preservations.has(relatedPreservationId)))
      );
    },
    validLineageForCustomers(customerIds) {
      return (
        (payload.paymentAllocations ?? []).every(
          (row) => customerIds.has(row["customerId"]) && this.validAllocation(row),
        ) &&
        (payload.paymentAllocationReversals ?? []).every(
          (row) => customerIds.has(row["customerId"]) && this.validReversal(row),
        ) &&
        (payload.customerPaymentCreditPreservations ?? []).every(
          (row) => customerIds.has(row["customerId"]) && this.validCreditPreservation(row),
        )
      );
    },
  };
}
