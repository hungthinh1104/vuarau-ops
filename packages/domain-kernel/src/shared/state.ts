import type {
  CurrencyCode,
  CustomerId,
  IsoInstant,
  Money,
  SaleId,
  SaleLineId,
  SaleStatus,
  SaleVoidId,
  SaleVoidReasonCode,
  PaymentId,
  PaymentMethod,
  PaymentStatus,
  ProductId,
  Quantity,
  WorkspaceId,
} from "@vuarau/domain-contracts";

/**
 * Aggregate state as the domain sees it — not as the database stores it and not
 * as the API returns it. Repositories map rows to these; mappers turn these into
 * DTOs. Neither shape leaks into the other.
 */

/**
 * The customer account balance as the domain computes it.
 *
 * Distinct from `CustomerAccountBalanceDto`, which additionally carries
 * `capabilities` — and capabilities depend on *who is asking*, which the kernel
 * must not know (ADR-0003). The application layer maps one to the other.
 */
export type CustomerAccountBalance = {
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  /** May be negative: that means the customer is in credit (ASM-001). */
  readonly balance: Money;
  readonly entryCount: number;
  readonly lastEntryTransactionTime: IsoInstant | null;
  readonly updatedAt: IsoInstant;
};

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

export type SaleLineState = {
  readonly lineId: SaleLineId;
  readonly productId: ProductId | null;
  /** Snapshot taken at entry time; later catalogue edits must not change it (ASM-008). */
  readonly productName: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
};

/**
 * The record that a posted sale was undone. Written once, never updated
 * (BR-SALE-013), and the reason the `SaleState` above needs no `voided` flag.
 */
export type SaleVoidState = {
  readonly id: SaleVoidId;
  readonly workspaceId: WorkspaceId;
  readonly saleId: SaleId;
  readonly reasonCode: SaleVoidReasonCode;
  readonly reason: string;
  /** Always the full posted total, taken from the sale, never from the caller. */
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

export type SaleState = {
  readonly id: SaleId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId;
  readonly status: SaleStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly SaleLineState[];
  readonly totalAmount: Money;
  readonly note: string | null;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly postedAt: IsoInstant | null;
  readonly discardedAt: IsoInstant | null;
  /** Null means no payment term was agreed, and nothing is overdue (BR-SALE-017). */
  readonly dueAt: IsoInstant | null;
  /** Set at draft creation when this sale corrects a voided one (BR-SALE-016). */
  readonly replacesSaleId: SaleId | null;
  /**
   * The void record, when one exists. Loaded alongside the sale rather than
   * stored on it: the sale row is immutable, so "is this voided" is a question
   * about a *different* row (BR-SALE-008).
   */
  readonly voidRecord: SaleVoidState | null;
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
