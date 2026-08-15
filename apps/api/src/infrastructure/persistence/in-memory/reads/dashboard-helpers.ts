import {
  OPERATIONS_EXCEPTION_KINDS,
  type OperationsBoardFilter,
  type OperationsBoardRow,
  type OperationsBoardSort,
  type OperationsBoardDto,
  type OperationsExceptionKind,
} from "@vuarau/domain-contracts";

type BoardCursorPosition = { readonly sortValue: string; readonly id: string };

export function latestTimestamp(
  values: readonly (string | null | undefined)[],
  fallback: string,
): string {
  return values
    .filter((value): value is string => value !== null && value !== undefined)
    .reduce((current, value) => (value > current ? value : current), fallback);
}

export function matchesOperationsBoardFilter(
  row: OperationsBoardRow,
  filter: OperationsBoardFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "outstanding_delivery")
    return row.exceptions.some((exception) => exception.kind === "outstanding_delivery");
  if (filter === "incomplete_receiving")
    return row.exceptions.some((exception) => exception.kind === "incomplete_receiving");
  if (filter === "needs_receiving") return row.physicalState === "needs_receiving";
  if (filter === "needs_delivery") return row.physicalState === "needs_delivery";
  if (filter === "in_delivery") return row.physicalState === "in_delivery";
  if (filter === "returned_fulfilment") return row.returnedFulfilment;
  if (filter === "unallocated_payment") return row.unallocatedPayment;
  if (filter === "awaiting_payment") return row.financialState === "awaiting_payment";
  if (filter === "overdue") return row.financialState === "overdue";
  if (filter === "overdue_receivable")
    return row.exceptions.some((exception) => exception.kind === "overdue_receivable");
  if (filter === "attention") {
    return (
      row.commercialState === "attention" ||
      row.physicalState === "attention" ||
      row.financialState === "unallocated"
    );
  }
  return row.exceptions.some((exception) => exception.kind === filter);
}

export function operationsBoardCursorOf(
  row: OperationsBoardRow,
  sort: OperationsBoardSort,
): BoardCursorPosition {
  return sort === "amount_desc"
    ? { sortValue: String(row.amount.amountMinor), id: row.id }
    : sort === "age_desc"
      ? { sortValue: String(row.ageSeconds), id: row.id }
      : { sortValue: row.updatedAt, id: row.id };
}

export function isAfterOperationsBoardCursor(
  row: OperationsBoardRow,
  sort: OperationsBoardSort,
  after: BoardCursorPosition,
): boolean {
  if (sort === "amount_desc") {
    const amount = Number(after.sortValue);
    return (
      row.amount.amountMinor < amount || (row.amount.amountMinor === amount && row.id < after.id)
    );
  }
  if (sort === "age_desc") {
    const age = Number(after.sortValue);
    return row.ageSeconds < age || (row.ageSeconds === age && row.id < after.id);
  }
  return (
    row.updatedAt < after.sortValue || (row.updatedAt === after.sortValue && row.id < after.id)
  );
}

export function boardCounts(rows: readonly OperationsBoardDto["page"]["items"][number][]) {
  const has = (row: OperationsBoardDto["page"]["items"][number], kind: OperationsExceptionKind) =>
    row.exceptions.some((exception) => exception.kind === kind);
  const exceptionCounts = Object.fromEntries(
    OPERATIONS_EXCEPTION_KINDS.map((kind) => [kind, rows.filter((row) => has(row, kind)).length]),
  ) as Record<OperationsExceptionKind, number>;
  return {
    all: rows.length,
    outstandingDelivery: exceptionCounts.outstanding_delivery,
    incompleteReceiving: exceptionCounts.incomplete_receiving,
    needsReceiving: rows.filter((row) => row.physicalState === "needs_receiving").length,
    needsDelivery: rows.filter((row) => row.physicalState === "needs_delivery").length,
    inDelivery: rows.filter((row) => row.physicalState === "in_delivery").length,
    returnedFulfilment: rows.filter((row) => row.returnedFulfilment).length,
    unallocatedPayment: rows.filter((row) => row.unallocatedPayment).length,
    awaitingPayment: rows.filter((row) => row.financialState === "awaiting_payment").length,
    overdue: rows.filter((row) => row.financialState === "overdue").length,
    overdueReceivable: exceptionCounts.overdue_receivable,
    fulfilmentRemainderUnresolved: exceptionCounts.fulfilment_remainder_unresolved,
    returnSettlementUnresolved: exceptionCounts.return_settlement_unresolved,
    reconciliationVariance: exceptionCounts.reconciliation_variance,
    exceptionCounts,
    attention: rows.filter(
      (row) =>
        row.commercialState === "attention" ||
        row.physicalState === "attention" ||
        row.financialState === "unallocated",
    ).length,
  };
}
