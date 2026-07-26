import type {
  CustomerAccountBalanceDto,
  CustomerDto,
  AccountCapabilities,
  IsoInstant,
  SaleDto,
  PaymentDto,
} from "@vuarau/domain-contracts";
import type {
  CustomerAccountBalance,
  CustomerState,
  SaleState,
  PaymentState,
} from "@vuarau/domain-kernel";
import {
  classifyBalance,
  paymentCapabilities,
  remainingReversibleAmount,
  saleCapabilities,
  saleDueState,
  saleFinancialState,
} from "@vuarau/domain-kernel";

/**
 * Domain state → API DTO. Explicit, field by field.
 *
 * No database row and no aggregate is ever returned directly: a spread would make
 * every future internal field part of the public contract by accident, and DTOs
 * carry things aggregates do not — capabilities, derived amounts.
 */

export function toCustomerDto(customer: CustomerState): CustomerDto {
  return {
    id: customer.id,
    workspaceId: customer.workspaceId,
    displayName: customer.displayName,
    phone: customer.phone,
    note: customer.note,
    isActive: customer.isActive,
    version: customer.version,
    transactionTime: customer.transactionTime,
    recordedAt: customer.recordedAt,
    updatedAt: customer.updatedAt,
  };
}

/**
 * `asOf` is the reading clock, needed only for `dueState` (BR-SALE-017). Passed
 * in rather than read here so that a DTO is a pure function of state plus time —
 * two calls with the same arguments produce the same document.
 */
export function toSaleDto(sale: SaleState, asOf: IsoInstant): SaleDto {
  return {
    id: sale.id,
    workspaceId: sale.workspaceId,
    customerId: sale.customerId,
    status: sale.status,
    currency: sale.currency,
    lines: sale.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    totalAmount: sale.totalAmount,
    note: sale.note,
    version: sale.version,
    transactionTime: sale.transactionTime,
    recordedAt: sale.recordedAt,
    postedAt: sale.postedAt,
    dueAt: sale.dueAt,
    replacesSaleId: sale.replacesSaleId,
    // Both derived, never stored (state catalog): a `voided` column would have to
    // be kept true by updating a row that is promised to be immutable, and an
    // `overdue` column would have to be kept true by a cron job.
    financialState: saleFinancialState(sale),
    dueState: saleDueState(sale, asOf),
    voidRecord:
      sale.voidRecord === null
        ? null
        : {
            id: sale.voidRecord.id,
            saleId: sale.voidRecord.saleId,
            reasonCode: sale.voidRecord.reasonCode,
            reason: sale.voidRecord.reason,
            amount: sale.voidRecord.amount,
            transactionTime: sale.voidRecord.transactionTime,
            recordedAt: sale.voidRecord.recordedAt,
          },
    // Computed by the same functions the command handlers use, so a greyed-out
    // button and a server refusal always agree (ADR-0003).
    capabilities: saleCapabilities(sale),
  };
}

export function toPaymentDto(payment: PaymentState): PaymentDto {
  return {
    id: payment.id,
    workspaceId: payment.workspaceId,
    customerId: payment.customerId,
    amount: payment.amount,
    currency: payment.amount.currency,
    method: payment.method,
    payerName: payment.payerName,
    note: payment.note,
    status: payment.status,
    reversedAmount: payment.reversedAmount,
    remainingReversibleAmount: remainingReversibleAmount(payment),
    version: payment.version,
    transactionTime: payment.transactionTime,
    recordedAt: payment.recordedAt,
    capabilities: paymentCapabilities(payment),
  };
}

/**
 * The account balance DTO is the domain value plus the caller's capabilities,
 * which is why the capabilities are a parameter rather than something this
 * function could work out: they depend on *who is asking* (BR-AUTH-004).
 */
export function toAccountBalanceDto(
  balance: CustomerAccountBalance,
  capabilities: AccountCapabilities,
): CustomerAccountBalanceDto {
  return {
    workspaceId: balance.workspaceId,
    customerId: balance.customerId,
    balance: balance.balance,
    // Named here, once, rather than left for each client to work out from the
    // sign (BR-ACCOUNT-009).
    classification: classifyBalance(balance.balance),
    entryCount: balance.entryCount,
    lastEntryTransactionTime: balance.lastEntryTransactionTime,
    updatedAt: balance.updatedAt,
    capabilities,
  };
}
