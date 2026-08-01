import type {
  CreateSupplierCommand,
  DeactivateSupplierCommand,
  IsoInstant,
  ReactivateSupplierCommand,
  RecordSupplierPaymentCommand,
  ReverseSupplierPaymentCommand,
  SupplierBalanceClassification,
  UpdateSupplierCommand,
} from "@vuarau/domain-contracts";
import type { SupplierPaymentState, SupplierState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { money } from "../shared/money.ts";

const clean = (value: string | null): string | null => {
  const normalized = value?.trim() ?? "";
  return normalized.length === 0 ? null : normalized;
};

export function decideCreateSupplier(
  command: CreateSupplierCommand,
  recordedAt: IsoInstant,
): DomainResult<SupplierState> {
  const displayName = command.payload.displayName.trim();
  if (displayName.length === 0) return err("INVALID_COMMAND_PAYLOAD", "Supplier name is required.");
  return ok({
    id: command.payload.supplierId,
    workspaceId: command.workspaceId,
    displayName,
    phone: clean(command.payload.phone),
    note: clean(command.payload.note),
    isActive: true,
    version: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}

export function decideUpdateSupplier(
  current: SupplierState,
  command: UpdateSupplierCommand,
  recordedAt: IsoInstant,
): DomainResult<SupplierState> {
  if (current.version !== command.expectedVersion)
    return err("SUPPLIER_VERSION_CONFLICT", "Supplier changed on the server.");
  const displayName = command.payload.displayName.trim();
  if (displayName.length === 0) return err("INVALID_COMMAND_PAYLOAD", "Supplier name is required.");
  return ok({
    ...current,
    displayName,
    phone: clean(command.payload.phone),
    note: clean(command.payload.note),
    version: current.version + 1,
    updatedAt: recordedAt,
  });
}

export function decideSupplierLifecycle(
  current: SupplierState,
  command: DeactivateSupplierCommand | ReactivateSupplierCommand,
  active: boolean,
  recordedAt: IsoInstant,
): DomainResult<SupplierState> {
  if (current.version !== command.expectedVersion)
    return err("SUPPLIER_VERSION_CONFLICT", "Supplier changed on the server.");
  if (current.isActive === active)
    return err("INVALID_COMMAND_PAYLOAD", `Supplier is already ${active ? "active" : "inactive"}.`);
  return ok({
    ...current,
    isActive: active,
    version: current.version + 1,
    updatedAt: recordedAt,
  });
}

export function decideRecordSupplierPayment(
  command: RecordSupplierPaymentCommand,
  recordedAt: IsoInstant,
): DomainResult<SupplierPaymentState> {
  if (
    !Number.isSafeInteger(command.payload.amount.amountMinor) ||
    command.payload.amount.amountMinor <= 0
  )
    return err("SUPPLIER_PAYMENT_AMOUNT_INVALID", "Supplier payment must be positive.");
  return ok({
    id: command.payload.supplierPaymentId,
    workspaceId: command.workspaceId,
    supplierId: command.payload.supplierId,
    amount: command.payload.amount,
    method: command.payload.method,
    cashAccountId: command.payload.cashAccountId ?? null,
    note: clean(command.payload.note),
    reversedAmount: money(0, command.payload.amount.currency),
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
  });
}

export function decideReverseSupplierPayment(
  current: SupplierPaymentState,
  command: ReverseSupplierPaymentCommand,
): DomainResult<SupplierPaymentState> {
  if (current.version !== command.expectedVersion)
    return err("SUPPLIER_VERSION_CONFLICT", "Supplier payment changed on the server.");
  if (command.payload.reason.trim().length === 0)
    return err(
      "SUPPLIER_PAYMENT_REVERSAL_REASON_REQUIRED",
      "Supplier payment reversal requires a reason.",
    );
  const amount = command.payload.amount;
  const remaining = current.amount.amountMinor - current.reversedAmount.amountMinor;
  if (
    amount.currency !== current.amount.currency ||
    !Number.isSafeInteger(amount.amountMinor) ||
    amount.amountMinor <= 0 ||
    amount.amountMinor > remaining
  ) {
    return err(
      "SUPPLIER_PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT",
      "Reversal exceeds the remaining supplier payment.",
    );
  }
  return ok({
    ...current,
    reversedAmount: money(
      current.reversedAmount.amountMinor + amount.amountMinor,
      current.amount.currency,
    ),
    version: current.version + 1,
  });
}

export function classifySupplierBalance(amountMinor: number): SupplierBalanceClassification {
  return amountMinor > 0 ? "payable" : amountMinor < 0 ? "supplier_credit" : "settled";
}
