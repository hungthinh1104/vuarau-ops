import type { CashMovementDto, CashReconciliationDto } from "@vuarau/domain-contracts";
import type { Repositories } from "../../ports.ts";
import { after, ascendingBy, fold, key, takePage } from "../store.ts";
import type { Store } from "../store.ts";

const canonicalBalance = (
  store: Store,
  workspaceId: CashMovementDto["workspaceId"],
  cashAccountId: CashMovementDto["cashAccountId"],
) => {
  const account = store.cashAccounts.get(key(workspaceId, cashAccountId));
  if (account === undefined) return null;
  const movements = store.cashMovements.filter(
    (movement) =>
      movement.workspaceId === workspaceId && movement.cashAccountId === cashAccountId,
  );
  return {
    workspaceId,
    cashAccountId,
    balance: {
      amountMinor: movements.reduce((sum, movement) => sum + movement.amount.amountMinor, 0),
      currency: account.currency,
    },
    movementCount: movements.length,
    lastMovementTransactionTime:
      movements.map((movement) => movement.transactionTime).sort().at(-1) ?? null,
    updatedAt:
      movements.map((movement) => movement.recordedAt).sort().at(-1) ?? account.updatedAt,
  };
};

function sourceValid(store: Store, movement: CashMovementDto): boolean {
  const signed = movement.amount.amountMinor;
  if (movement.sourceType === "customer_payment") {
    const payment = store.payments.get(key(movement.workspaceId, movement.sourceId));
    return (
      payment !== undefined &&
      (payment.cashAccountId ?? null) === movement.cashAccountId &&
      signed === payment.amount.amountMinor
    );
  }
  if (movement.sourceType === "customer_payment_reversal") {
    const reversal = store.reversals.find(
      (candidate) =>
        candidate.workspaceId === movement.workspaceId && candidate.id === movement.sourceId,
    );
    if (reversal === undefined) return false;
    const payment = store.payments.get(key(movement.workspaceId, reversal.paymentId));
    return (
      payment !== undefined &&
      (payment.cashAccountId ?? movement.cashAccountId) === movement.cashAccountId &&
      signed === -reversal.amount.amountMinor
    );
  }
  if (movement.sourceType === "supplier_payment") {
    const payment = store.supplierPayments.get(key(movement.workspaceId, movement.sourceId));
    return (
      payment !== undefined &&
      (payment.cashAccountId ?? null) === movement.cashAccountId &&
      signed === -payment.amount.amountMinor
    );
  }
  if (movement.sourceType === "supplier_payment_reversal") {
    const reversal = store.supplierPaymentReversals.find(
      (candidate) =>
        candidate.workspaceId === movement.workspaceId && candidate.id === movement.sourceId,
    );
    if (reversal === undefined) return false;
    const payment = store.supplierPayments.get(
      key(movement.workspaceId, reversal.supplierPaymentId),
    );
    return (
      payment !== undefined &&
      (payment.cashAccountId ?? movement.cashAccountId) === movement.cashAccountId &&
      signed === reversal.amount.amountMinor
    );
  }
  if (movement.sourceType === "expense") {
    const expense = store.expenses.get(key(movement.workspaceId, movement.sourceId));
    return expense !== undefined && expense.cashAccountId === movement.cashAccountId && signed === -expense.amount.amountMinor;
  }
  if (movement.sourceType === "expense_reversal") {
    const expense = [...store.expenses.values()].find(
      (candidate) => candidate.workspaceId === movement.workspaceId && candidate.reversal?.id === movement.sourceId,
    );
    return expense !== undefined && expense.cashAccountId === movement.cashAccountId && signed === expense.amount.amountMinor;
  }
  if (movement.sourceType === "cash_adjustment") {
    const adjustment = store.cashAdjustments.find(
      (candidate) => candidate.workspaceId === movement.workspaceId && candidate.id === movement.sourceId,
    );
    return adjustment !== undefined && adjustment.cashAccountId === movement.cashAccountId && signed === adjustment.amount.amountMinor;
  }
  if (movement.sourceType.startsWith("cash_transfer")) {
    const transfer = movement.sourceType.includes("reversal")
      ? [...store.cashTransfers.values()].find(
          (candidate) => candidate.workspaceId === movement.workspaceId && candidate.reversal?.id === movement.sourceId,
        )
      : store.cashTransfers.get(key(movement.workspaceId, movement.sourceId));
    if (transfer === undefined) return false;
    const isOut = movement.sourceType.endsWith("_out");
    const accountId = isOut ? transfer.fromCashAccountId : transfer.toCashAccountId;
    const expected = isOut ? -transfer.amount.amountMinor : transfer.amount.amountMinor;
    const reversedExpected = movement.sourceType.includes("reversal") ? -expected : expected;
    return movement.cashAccountId === accountId && signed === reversedExpected;
  }
  return false;
}

export const createCashReads = (store: Store): Pick<Repositories, "cashReads"> => ({
  cashReads: {
    searchAccounts: async ({ workspaceId, query, isActive, page }) => {
      const needle = fold(query.trim());
      const rows = [...store.cashAccounts.values()]
        .filter((account) => account.workspaceId === workspaceId)
        .filter((account) => isActive === null || account.isActive === isActive)
        .filter(
          (account) => needle.length === 0 || fold(account.displayName).includes(needle),
        )
        .sort(ascendingBy((account) => account.displayName, (account) => account.id))
        .filter((account) =>
          page.after === null
            ? true
            : after([account.displayName, account.id], [page.after.sortValue, page.after.id]),
        )
        .map((account) => ({
          account,
          balance:
            store.cashBalances.get(key(workspaceId, account.id)) ??
            canonicalBalance(store, workspaceId, account.id)!,
        }));
      return takePage(rows, page, (row) => ({
        sortValue: row.account.displayName,
        id: row.account.id,
      }));
    },
    account: async (workspaceId, cashAccountId) => {
      const account = store.cashAccounts.get(key(workspaceId, cashAccountId));
      if (account === undefined) return null;
      return {
        account,
        balance:
          store.cashBalances.get(key(workspaceId, cashAccountId)) ??
          canonicalBalance(store, workspaceId, cashAccountId)!,
      };
    },
    timeline: async ({ workspaceId, cashAccountId, from, to, page }) => {
      const rows = store.cashMovements
        .filter(
          (movement) =>
            movement.workspaceId === workspaceId &&
            movement.cashAccountId === cashAccountId &&
            (from === null || movement.transactionTime >= from) &&
            (to === null || movement.transactionTime < to),
        )
        .sort((left, right) =>
          left.transactionTime !== right.transactionTime
            ? right.transactionTime.localeCompare(left.transactionTime)
            : left.recordedAt !== right.recordedAt
              ? right.recordedAt.localeCompare(left.recordedAt)
              : right.id.localeCompare(left.id),
        )
        .filter((movement) => {
          if (page.after === null) return true;
          const sort = `${movement.transactionTime}|${movement.recordedAt}`;
          return sort < page.after.sortValue || (sort === page.after.sortValue && movement.id < page.after.id);
        });
      return takePage(rows, page, (movement) => ({
        sortValue: `${movement.transactionTime}|${movement.recordedAt}`,
        id: movement.id,
      }));
    },
    expense: async (workspaceId, expenseId) =>
      store.expenses.get(key(workspaceId, expenseId)) ?? null,
    transfer: async (workspaceId, transferId) =>
      store.cashTransfers.get(key(workspaceId, transferId)) ?? null,
    reconciliation: async (workspaceId, cashAccountId): Promise<CashReconciliationDto> => {
      const account = store.cashAccounts.get(key(workspaceId, cashAccountId));
      if (account === undefined) {
        return { status: "not_found", cashAccountId, projected: null, canonical: null, diagnostics: [] };
      }
      const movements = store.cashMovements.filter(
        (movement) => movement.workspaceId === workspaceId && movement.cashAccountId === cashAccountId,
      );
      const diagnostics = movements.flatMap((movement) =>
        movement.amount.amountMinor === 0
          ? ["zero_movement"]
          : movement.amount.currency !== account.currency
            ? ["currency_mismatch"]
            : sourceValid(store, movement)
              ? []
              : ["missing_or_mismatched_source"],
      );
      const canonical = canonicalBalance(store, workspaceId, cashAccountId);
      const projected = store.cashBalances.get(key(workspaceId, cashAccountId)) ?? null;
      if (diagnostics.length > 0) {
        return { status: "integrity_failure", cashAccountId, projected, canonical, diagnostics };
      }
      const consistent =
        projected !== null &&
        canonical !== null &&
        projected.balance.amountMinor === canonical.balance.amountMinor &&
        projected.balance.currency === canonical.balance.currency &&
        projected.movementCount === canonical.movementCount;
      return {
        status: consistent ? "consistent" : "inconsistent",
        cashAccountId,
        projected,
        canonical,
        diagnostics: consistent ? [] : ["projection_drift"],
      };
    },
  },
});
