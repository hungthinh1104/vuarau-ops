import type {
  ActorId,
  CommandId,
  CurrencyCode,
  CustomerId,
  CustomerAccountEntryDto,
  CustomerAccountEntryId,
  IsoInstant,
  Money,
  SaleId,
  SaleVoidId,
  PaymentId,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleLineState,
  SaleState,
  SaleVoidState,
  PaymentState,
} from "@vuarau/domain-kernel";
import { derivePaymentStatus } from "@vuarau/domain-kernel";

/**
 * Row ⇄ domain state. Explicit in both directions.
 *
 * These types never leave the persistence layer: a database row is not an API
 * contract, and a `SELECT *` that grows a column must not silently grow the
 * public surface.
 */

type DateLike = Date | string;

export const toIso = (value: DateLike): IsoInstant =>
  (value instanceof Date ? value : new Date(value)).toISOString() as IsoInstant;
export const toIsoOrNull = (value: DateLike | null): IsoInstant | null =>
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

export type SaleRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  status: SaleState["status"];
  currency: CurrencyCode;
  totalAmountMinor: number;
  note: string | null;
  version: number;
  transactionTime: Date;
  recordedAt: Date;
  postedAt: Date | null;
  discardedAt: Date | null;
  dueAt: Date | null;
  replacesSaleId: string | null;
};

export type SaleLineRow = {
  id: string;
  productId: string | null;
  productName: string;
  qualityGradeId: string | null;
  qualityGradeName: string | null;
  quantityScaled: number;
  unit: SaleLineState["quantity"]["unit"];
  unitPriceMinor: number;
  lineTotalMinor: number;
  currency: CurrencyCode;
};

export type SaleVoidRow = {
  id: string;
  workspaceId: string;
  saleId: string;
  reasonCode: SaleVoidState["reasonCode"];
  reason: string;
  amountMinor: number;
  currency: CurrencyCode;
  transactionTime: Date;
  recordedAt: Date;
  actorId: string;
};

export function toSaleVoidState(row: SaleVoidRow): SaleVoidState {
  return {
    id: row.id as SaleVoidId,
    workspaceId: row.workspaceId as WorkspaceId,
    saleId: row.saleId as SaleId,
    reasonCode: row.reasonCode,
    reason: row.reason,
    amount: money(row.amountMinor, row.currency),
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ActorId,
  };
}

/**
 * The void is passed in rather than looked up here, because whether a sale is
 * voided is a fact about a *different* table — which is the whole point of not
 * storing it on the sale (BR-SALE-008).
 */
export function toSaleState(
  row: SaleRow,
  lineRows: readonly SaleLineRow[],
  voidRow: SaleVoidRow | null,
): SaleState {
  return {
    id: row.id as SaleId,
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    status: row.status,
    currency: row.currency,
    lines: lineRows.map((line) => ({
      lineId: line.id as SaleLineState["lineId"],
      productId: line.productId as SaleLineState["productId"],
      productName: line.productName,
      qualityGradeId: line.qualityGradeId as SaleLineState["qualityGradeId"],
      qualityGradeName: line.qualityGradeName,
      quantity: { valueScaled: line.quantityScaled, unit: line.unit },
      unitPrice: money(line.unitPriceMinor, line.currency),
      lineTotal: money(line.lineTotalMinor, line.currency),
    })),
    totalAmount: money(row.totalAmountMinor, row.currency),
    note: row.note,
    version: row.version,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    postedAt: toIsoOrNull(row.postedAt),
    discardedAt: toIsoOrNull(row.discardedAt),
    dueAt: toIsoOrNull(row.dueAt),
    replacesSaleId: row.replacesSaleId as SaleId | null,
    voidRecord: voidRow === null ? null : toSaleVoidState(voidRow),
  };
}

export type PaymentRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  amountMinor: number;
  currency: CurrencyCode;
  method: PaymentState["method"];
  cashAccountId: string | null;
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
    cashAccountId: row.cashAccountId as NonNullable<PaymentState["cashAccountId"]> | null,
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

export type AccountEntryRow = {
  id: string;
  workspaceId: string;
  customerId: string;
  amountMinor: number;
  currency: CurrencyCode;
  sourceType: CustomerAccountEntryDto["sourceType"];
  sourceId: string;
  reversalOfEntryId: string | null;
  reasonCode: CustomerAccountEntryDto["reasonCode"];
  reason: string | null;
  transactionTime: Date;
  recordedAt: Date;
  actorId: string;
  commandId: string;
};

export function toAccountEntryDto(row: AccountEntryRow): CustomerAccountEntryDto {
  return {
    id: row.id as CustomerAccountEntryId,
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    amount: money(row.amountMinor, row.currency),
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    reversalOfEntryId: row.reversalOfEntryId as CustomerAccountEntryId | null,
    reasonCode: row.reasonCode,
    reason: row.reason,
    transactionTime: toIso(row.transactionTime),
    recordedAt: toIso(row.recordedAt),
    actorId: row.actorId as ActorId,
    commandId: row.commandId as CommandId,
  };
}

export type AccountBalanceRow = {
  workspaceId: string;
  customerId: string;
  balanceMinor: number;
  currency: CurrencyCode;
  entryCount: number;
  lastEntryTransactionTime: Date | null;
  updatedAt: Date;
};

/** Returns the domain value; `capabilities` are added by the application layer. */
export function toCustomerAccountBalance(row: AccountBalanceRow): CustomerAccountBalance {
  return {
    workspaceId: row.workspaceId as WorkspaceId,
    customerId: row.customerId as CustomerId,
    balance: money(row.balanceMinor, row.currency),
    entryCount: row.entryCount,
    lastEntryTransactionTime: toIsoOrNull(row.lastEntryTransactionTime),
    updatedAt: toIso(row.updatedAt),
  };
}
