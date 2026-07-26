import type { CustomerDto, OrderDto, PaymentDto } from "@vuanha/domain-contracts";
import type { CustomerState, OrderState, PaymentState } from "@vuanha/domain-kernel";
import {
  orderCapabilities,
  paymentCapabilities,
  remainingReversibleAmount,
} from "@vuanha/domain-kernel";

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

export function toOrderDto(order: OrderState): OrderDto {
  return {
    id: order.id,
    workspaceId: order.workspaceId,
    customerId: order.customerId,
    status: order.status,
    currency: order.currency,
    lines: order.lines.map((line) => ({
      lineId: line.lineId,
      productId: line.productId,
      productName: line.productName,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
    })),
    totalAmount: order.totalAmount,
    note: order.note,
    version: order.version,
    transactionTime: order.transactionTime,
    recordedAt: order.recordedAt,
    confirmedAt: order.confirmedAt,
    cancelledAt: order.cancelledAt,
    // Computed by the same functions the command handlers use, so a greyed-out
    // button and a server refusal always agree (ADR-0003).
    capabilities: orderCapabilities(order),
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
