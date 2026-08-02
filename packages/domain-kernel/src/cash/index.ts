import type {
  AdjustCashCommand,
  CashAccountDto,
  CashMovementDto,
  CashTransferDto,
  CreateCashAccountCommand,
  ExpenseDto,
  IsoInstant,
  ReactivateCashAccountCommand,
  RecordCashTransferCommand,
  RecordExpenseCommand,
  ReverseCashTransferCommand,
  ReverseExpenseCommand,
  UpdateCashAccountCommand,
  DeactivateCashAccountCommand,
} from "@vuarau/domain-contracts";
import type { AuditDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function validCustodian(
  kind: CashAccountDto["kind"],
  custodian: CashAccountDto["custodianActorId"],
): boolean {
  return kind === "employee_holding" ? custodian !== null : custodian === null;
}

export function decideCreateCashAccount(
  command: CreateCashAccountCommand,
  recordedAt: IsoInstant,
): DomainResult<{ account: CashAccountDto; audit: AuditDraft }> {
  if (!validCustodian(command.payload.kind, command.payload.custodianActorId)) {
    return err(
      "CASH_ACCOUNT_CUSTODIAN_INVALID",
      "Employee-held cash needs one custodian; shared accounts may not name one.",
    );
  }
  const account: CashAccountDto = {
    id: command.payload.cashAccountId,
    workspaceId: command.workspaceId,
    displayName: command.payload.displayName,
    kind: command.payload.kind,
    currency: command.payload.currency,
    custodianActorId: command.payload.custodianActorId,
    note: command.payload.note,
    isActive: true,
    version: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  };
  return ok({
    account,
    audit: {
      aggregateType: "cash_account",
      aggregateId: account.id,
      action: "cash_account.created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        kind: account.kind,
        currency: account.currency,
        custodianActorId: account.custodianActorId,
      },
      reason: null,
    },
  });
}

export function decideUpdateCashAccount(
  command: UpdateCashAccountCommand,
  current: CashAccountDto,
  recordedAt: IsoInstant,
): DomainResult<{ account: CashAccountDto; audit: AuditDraft }> {
  if (command.expectedVersion !== current.version) {
    return err("CASH_ACCOUNT_VERSION_CONFLICT", "Cash account changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  if (!validCustodian(command.payload.kind, command.payload.custodianActorId)) {
    return err(
      "CASH_ACCOUNT_CUSTODIAN_INVALID",
      "Employee-held cash needs one custodian; shared accounts may not name one.",
    );
  }
  if (command.payload.currency !== current.currency) {
    return err(
      "CASH_ACCOUNT_CURRENCY_MISMATCH",
      "Cash account currency cannot change after creation.",
    );
  }
  const account: CashAccountDto = {
    ...current,
    displayName: command.payload.displayName,
    kind: command.payload.kind,
    custodianActorId: command.payload.custodianActorId,
    note: command.payload.note,
    version: current.version + 1,
    updatedAt: recordedAt,
  };
  return ok({
    account,
    audit: {
      aggregateType: "cash_account",
      aggregateId: account.id,
      action: "cash_account.updated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: {
        kind: current.kind,
        custodianActorId: current.custodianActorId,
        version: current.version,
      },
      after: {
        kind: account.kind,
        custodianActorId: account.custodianActorId,
        version: account.version,
      },
      reason: null,
    },
  });
}

export function decideCashAccountLifecycle(
  command: DeactivateCashAccountCommand | ReactivateCashAccountCommand,
  current: CashAccountDto,
  targetActive: boolean,
  recordedAt: IsoInstant,
): DomainResult<{ account: CashAccountDto; audit: AuditDraft }> {
  if (command.expectedVersion !== current.version) {
    return err("CASH_ACCOUNT_VERSION_CONFLICT", "Cash account changed on the server.", {
      expectedVersion: command.expectedVersion,
      actualVersion: current.version,
    });
  }
  if (current.isActive === targetActive) {
    return err(
      targetActive ? "CASH_ACCOUNT_ALREADY_ACTIVE" : "CASH_ACCOUNT_ALREADY_INACTIVE",
      targetActive ? "Cash account is already active." : "Cash account is already inactive.",
    );
  }
  const account = {
    ...current,
    isActive: targetActive,
    version: current.version + 1,
    updatedAt: recordedAt,
  };
  return ok({
    account,
    audit: {
      aggregateType: "cash_account",
      aggregateId: account.id,
      action: targetActive ? "cash_account.reactivated" : "cash_account.deactivated",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { isActive: current.isActive, version: current.version },
      after: { isActive: account.isActive, version: account.version },
      reason: command.payload.reason,
    },
  });
}

export function decideRecordExpense(
  command: RecordExpenseCommand,
  account: CashAccountDto,
  recordedAt: IsoInstant,
): DomainResult<{ expense: ExpenseDto; movementAmountMinor: number; audit: AuditDraft }> {
  if (!account.isActive) return err("CASH_ACCOUNT_INACTIVE", "Cash account is inactive.");
  if (command.payload.amount.amountMinor <= 0) {
    return err("CASH_AMOUNT_INVALID", "Expense amount must be positive.");
  }
  if (command.payload.amount.currency !== account.currency) {
    return err("CASH_ACCOUNT_CURRENCY_MISMATCH", "Expense currency must match the cash account.");
  }
  const expense: ExpenseDto = {
    id: command.payload.expenseId,
    workspaceId: command.workspaceId,
    cashAccountId: account.id,
    category: command.payload.category,
    amount: command.payload.amount,
    payee: command.payload.payee,
    note: command.payload.note,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    expense,
    movementAmountMinor: -expense.amount.amountMinor,
    audit: {
      aggregateType: "expense",
      aggregateId: expense.id,
      action: "expense.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        cashAccountId: account.id,
        category: expense.category,
        amountMinor: expense.amount.amountMinor,
      },
      reason: expense.note,
    },
  });
}

export function decideReverseExpense(
  command: ReverseExpenseCommand,
  expense: ExpenseDto,
  recordedAt: IsoInstant,
): DomainResult<{ expense: ExpenseDto; movementAmountMinor: number; audit: AuditDraft }> {
  if (expense.reversal !== null)
    return err("EXPENSE_ALREADY_REVERSED", "Expense is already reversed.");
  const updated: ExpenseDto = {
    ...expense,
    reversal: {
      id: command.payload.reversalId,
      reason: command.payload.reason,
      transactionTime: command.occurredAt,
      recordedAt,
      actorId: command.actorId,
      commandId: command.commandId,
    },
  };
  return ok({
    expense: updated,
    movementAmountMinor: expense.amount.amountMinor,
    audit: {
      aggregateType: "expense",
      aggregateId: expense.id,
      action: "expense.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { reversed: false },
      after: { reversed: true, amountMinor: expense.amount.amountMinor },
      reason: command.payload.reason,
    },
  });
}

export function decideRecordCashTransfer(
  command: RecordCashTransferCommand,
  from: CashAccountDto,
  to: CashAccountDto,
  recordedAt: IsoInstant,
): DomainResult<{ transfer: CashTransferDto; audit: AuditDraft }> {
  if (from.id === to.id) return err("CASH_TRANSFER_INVALID", "Transfer accounts must differ.");
  if (!from.isActive || !to.isActive)
    return err("CASH_ACCOUNT_INACTIVE", "Both cash accounts must be active.");
  if (command.payload.amount.amountMinor <= 0)
    return err("CASH_AMOUNT_INVALID", "Transfer amount must be positive.");
  if (from.currency !== to.currency || command.payload.amount.currency !== from.currency) {
    return err("CASH_ACCOUNT_CURRENCY_MISMATCH", "Transfer currency must match both accounts.");
  }
  const transfer: CashTransferDto = {
    id: command.payload.transferId,
    workspaceId: command.workspaceId,
    fromCashAccountId: from.id,
    toCashAccountId: to.id,
    amount: command.payload.amount,
    note: command.payload.note,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
    reversal: null,
  };
  return ok({
    transfer,
    audit: {
      aggregateType: "cash_transfer",
      aggregateId: transfer.id,
      action: "cash_transfer.recorded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        fromCashAccountId: from.id,
        toCashAccountId: to.id,
        amountMinor: transfer.amount.amountMinor,
      },
      reason: transfer.note,
    },
  });
}

export function decideReverseCashTransfer(
  command: ReverseCashTransferCommand,
  transfer: CashTransferDto,
  recordedAt: IsoInstant,
): DomainResult<{ transfer: CashTransferDto; audit: AuditDraft }> {
  if (transfer.reversal !== null) {
    return err("CASH_TRANSFER_ALREADY_REVERSED", "Cash transfer is already reversed.");
  }
  const updated: CashTransferDto = {
    ...transfer,
    reversal: {
      id: command.payload.reversalId,
      reason: command.payload.reason,
      transactionTime: command.occurredAt,
      recordedAt,
      actorId: command.actorId,
      commandId: command.commandId,
    },
  };
  return ok({
    transfer: updated,
    audit: {
      aggregateType: "cash_transfer",
      aggregateId: transfer.id,
      action: "cash_transfer.reversed",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { reversed: false },
      after: { reversed: true, amountMinor: transfer.amount.amountMinor },
      reason: command.payload.reason,
    },
  });
}

export function decideAdjustCash(
  command: AdjustCashCommand,
  account: CashAccountDto,
  recordedAt: IsoInstant,
): DomainResult<{ movementAmountMinor: number; audit: AuditDraft }> {
  if (!account.isActive) return err("CASH_ACCOUNT_INACTIVE", "Cash account is inactive.");
  if (command.payload.amount.amountMinor <= 0)
    return err("CASH_AMOUNT_INVALID", "Cash adjustment must be positive.");
  if (command.payload.amount.currency !== account.currency) {
    return err(
      "CASH_ACCOUNT_CURRENCY_MISMATCH",
      "Adjustment currency must match the cash account.",
    );
  }
  const signed =
    command.payload.direction === "increase"
      ? command.payload.amount.amountMinor
      : -command.payload.amount.amountMinor;
  return ok({
    movementAmountMinor: signed,
    audit: {
      aggregateType: "cash",
      aggregateId: account.id,
      action: "cash.adjusted",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: { amountMinor: signed, reasonCode: command.payload.reasonCode },
      reason: command.payload.reason,
    },
  });
}

/** Helper for application effects; movement identity is supplied by the repository. */
export type CashMovementDraft = Omit<CashMovementDto, "id">;
