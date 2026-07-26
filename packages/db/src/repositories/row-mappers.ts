import type {
  ActorId,
  CommandId,
  CurrencyCode,
  CustomerDebtSummaryDto,
  CustomerId,
  DebtLedgerEntryDto,
  DebtLedgerEntryId,
  IsoInstant,
  Money,
  OrderId,
  PaymentId,
  WorkspaceId,
} from "@vuanha/domain-contracts";
import type {
  CustomerState,
  OrderLineState,
  OrderState,
  PaymentState,
} from "@vuanha/domain-kernel";
import { derivePaymentStatus } from "@vuanha/domain-kernel";

/**
 * Row ⇄ domain state. Explicit in both directions.
 *
 * These types never leave the persistence layer: a database row is not an API
 * contract, and a `SELECT *` that grows a column must not silently grow the
 * public surface.
 */

export const toIso = (value: Date): IsoInstant => value.toISOString() as IsoInstant;
export const toIsoOrNull = (value: Date | null): IsoInstant | null =>
  value === null ? null : toIso(value);
export const fromIso = (value: IsoInstant): Date => new Date(value);
export const fromIsoOrNull = (value: IsoInstant | null): Date | null =>
  value === null ? null : fromIso(value);

export const money = (amountMinor: number, currency: CurrencyCode): Money => ({
  amountMinor,
  currency,
});

export type CustomerRow = {
  id: string;
  workspaceId: string;
  displayName: string;
  phone: string | null;
  note: string | null;
  isActive: boolean;
  version: number;
  transactionTime: Date;
  recordedAt: Date;
  updatedAt: Date;
};

export function toCustomerState(row: CustomerRow): CustomerState {
  return {
    id: row.id as CustomerId,
    workspaceId: row.workspaceId as WorkspaceId,
    displayName: row.displayName,
    phone: row.phone,
    note: row.note,
    isActive: row.isActive,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export type OrderRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  status: OrderState["status"];
  currency: CurrencyCode;
  totalAmountMinor: number;
  note: string | null;
  version: number;
  transactionTime: Date;
  recordedAt: Date;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
};

export type OrderLineRow = {
  id: string;
  productId: string;
  productName: string;
  quantityScaled: number;
  unit: OrderLineState["quantity"]["unit"];
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: CurrencyCode;
};

export function toOrderState(row: OrderRow, lineRows: readonly OrderLineRow[]): OrderState {
  return {
    id: row.id as OrderId,
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    status: row.status,
    currency: row.currency,
    lines: lineRows.map((line) => ({
      lineId: line.id as OrderLineState["lineId"],
      productId: line.productId as OrderLineState["productId"],
      productName: line.productName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
      unitPrice: money(line.unitPriceMinor, line.currency),
      lineTotal: money(line.lineTotalMinor, line.currency),
    })),
    totalAmount: money(row.totalAmountMinor, row.currency),
    note: row.note,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    confirmedAt: toIsoOrNull(row.confirmedAt),
    cancelledAt: toIsoOrNull(row.cancelledAt),
  };
}

export type PaymentRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  amountMinor: number;
  currency: CurrencyCode;
  method: PaymentState["method"];
  payerName: string | null;
  note: string | null;
  reversedAmountMinor: number;
  version: number;
  transactionTime: Date;
  recordedAt: Date;
};

export function toPaymentState(row: PaymentRow): PaymentState {
  const amount = money(row.amountMinor, row.currency);
  const reversedAmount = money(row.reversedAmountMinor, row.currency);
  return {
    id: row.id as PaymentId,
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    amount,
    method: row.method,
    payerName: row.payerName,
    note: row.note,
    // Recomputed from `reversed_amount` rather than read from the stored column.
    // The column exists so queries can filter; this is the definition
    // (BR-PAYMENT-008), and reading it back this way means a drifted column can
    // never become the answer.
    status: derivePaymentStatus(amount, reversedAmount),
    reversedAmount,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
  };
}

export type LedgerEntryRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  amountMinor: number;
  currency: CurrencyCode;
  sourceType: DebtLedgerEntryDto["sourceType"];
  sourceId: string;
  reversalOfEntryId: string | null;
  reasonCode: DebtLedgerEntryDto["reasonCode"];
  reason: string | null;
  transactionTime: Date;
  recordedAt: Date;
  actorId: string;
  commandId: string;
};

export function toLedgerEntryDto(row: LedgerEntryRow): DebtLedgerEntryDto {
  return {
    id: row.id as DebtLedgerEntryId,
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    amount: money(row.amountMinor, row.currency),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversalOfEntryId: row.reversalOfEntryId as DebtLedgerEntryId | null,
    reasonCode: row.reasonCode,
    reason: row.reason,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ActorId,
    commandId: row.commandId as CommandId,
  };
}

export type DebtSummaryRow = {
  workspaceId: string;
  customerId: string;
  balanceMinor: number;
  currency: CurrencyCode;
  entryCount: number;
  lastEntryTransactionTime: Date | null;
  updatedAt: Date;
};

export function toDebtSummaryDto(row: DebtSummaryRow): CustomerDebtSummaryDto {
  return {
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    balance: money(row.balanceMinor, row.currency),
    entryCount: row.entryCount,
    lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
    updatedAt: toIso(row.updatedAt),
  };
}
