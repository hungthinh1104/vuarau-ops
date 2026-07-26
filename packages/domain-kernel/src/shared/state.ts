import type {
  CurrencyCode,
  CustomerId,
  IsoInstant,
  Money,
  OrderId,
  OrderLineId,
  OrderStatus,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  ProductId,
  Quantity,
  WorkspaceId,
} from "@vuanha/domain-contracts";

/**
 * Aggregate state as the domain sees it — not as the database stores it and not
 * as the API returns it. Repositories map rows to these; mappers turn these into
 * DTOs. Neither shape leaks into the other.
 */

export type CustomerState = {
  readonly id: CustomerId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly phone: string | null;
  readonly note: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

export type OrderLineState = {
  readonly lineId: OrderLineId;
  readonly productId: ProductId;
  /** Snapshot taken at entry time; later catalogue edits must not change it (ASM-008). */
  readonly productName: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
};

export type OrderState = {
  readonly id: OrderId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly status: OrderStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly OrderLineState[];
  readonly totalAmount: Money;
  readonly note: string | null;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly confirmedAt: IsoInstant | null;
  readonly cancelledAt: IsoInstant | null;
};

export type PaymentState = {
  readonly id: PaymentId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly payerName: string | null;
  readonly note: string | null;
  /** Derived from `reversedAmount` — never set directly (BR-PAYMENT-008). */
  readonly status: PaymentStatus;
  readonly reversedAmount: Money;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

export type PaymentReversalState = {
  readonly id: string;
  readonly workspaceId: WorkspaceId;
  readonly paymentId: PaymentId;
  readonly amount: Money;
  readonly reason: string;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

/** A payment plus the reversal record produced alongside it, when there is one. */
export type PaymentWithReversal = {
  readonly payment: PaymentState;
  readonly reversal: PaymentReversalState;
};
