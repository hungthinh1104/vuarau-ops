import type { OperationsBoardDto } from "@vuarau/domain-contracts";

export function boardCounts(rows: readonly OperationsBoardDto["page"]["items"][number][]) {
  return {
    all: rows.length,
    needsReceiving: rows.filter((row) => row.physicalState === "needs_receiving").length,
    needsDelivery: rows.filter((row) => row.physicalState === "needs_delivery").length,
    inDelivery: rows.filter((row) => row.physicalState === "in_delivery").length,
    returnedFulfilment: rows.filter((row) => row.returnedFulfilment).length,
    unallocatedPayment: rows.filter((row) => row.unallocatedPayment).length,
    awaitingPayment: rows.filter((row) => row.financialState === "awaiting_payment").length,
    overdue: rows.filter((row) => row.financialState === "overdue").length,
    attention: rows.filter(
      (row) =>
        row.commercialState === "attention" ||
        row.physicalState === "attention" ||
        row.financialState === "reconciliation_required",
    ).length,
  };
}
