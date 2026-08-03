import type {
  ActorId,
  CurrencyCode,
  CommandId,
  CustomerId,
  CustomerOrderChannel,
  CustomerOrderId,
  CustomerOrderLineId,
  CustomerOrderStatus,
  SupplyCommitmentId,
  SupplyCommitmentLineId,
  SupplyCommitmentStatus,
  IsoInstant,
  Money,
  PaymentTermSource,
  SaleId,
  SaleLineId,
  SaleStatus,
  SaleVoidId,
  SaleVoidReasonCode,
  PaymentId,
  CashAccountId,
  PaymentMethod,
  PaymentStatus,
  ProductId,
  PriceRuleId,
  PriceRuleKind,
  QualityGradeId,
  SupplierId,
  SupplierPaymentId,
  SupplierPaymentReversalId,
  PurchaseId,
  PurchaseLineId,
  PurchaseStatus,
  PurchaseVoidId,
  PurchaseVoidReasonCode,
  PurchaseReceiptId,
  PurchaseReceiptLineId,
  InventoryMovementId,
  InventoryMovementSourceType,
  PurchaseReceiptReversalId,
  Quantity,
  Unit,
  WorkspaceId,
  WorkspacePolicyVersionId,
  DeliveryId,
  DeliveryLineId,
  DeliveryReturnId,
  DeliveryStatus,
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

export type ProductState = {
  readonly id: ProductId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly preferredUnit: Quantity["unit"] | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

export type PriceRuleState = {
  readonly id: PriceRuleId;
  readonly workspaceId: WorkspaceId;
  readonly productId: ProductId;
  readonly qualityGradeId: QualityGradeId | null;
  readonly customerId: CustomerId | null;
  readonly unit: Unit;
  readonly kind: PriceRuleKind;
  readonly priority: number;
  readonly minimumQuantityScaled: number;
  readonly effectiveFrom: IsoInstant;
  readonly effectiveTo: IsoInstant | null;
  readonly baseUnitPrice: Money;
  readonly discountPerUnit: Money;
  readonly feePerUnit: Money;
  readonly finalUnitPrice: Money;
  readonly reason: string | null;
  readonly actorId: ActorId;
  readonly commandId: CommandId;
  readonly recordedAt: IsoInstant;
};

export type QualityGradeState = {
  readonly id: QualityGradeId;
  readonly workspaceId: WorkspaceId;
  readonly name: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

export type SupplierState = {
  readonly id: SupplierId;
  readonly workspaceId: WorkspaceId;
  readonly displayName: string;
  readonly phone: string | null;
  readonly note: string | null;
  readonly isActive: boolean;
  readonly version: number;
  readonly createdAt: IsoInstant;
  readonly updatedAt: IsoInstant;
};

export type SupplierPaymentState = {
  readonly id: SupplierPaymentId;
  readonly workspaceId: WorkspaceId;
  readonly supplierId: SupplierId;
  readonly amount: Money;
  readonly method: PaymentMethod;
  readonly cashAccountId?: CashAccountId | null;
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
  readonly reversedAmount: Money;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

export type SupplierPaymentReversalState = {
  readonly id: SupplierPaymentReversalId;
  readonly workspaceId: WorkspaceId;
  readonly supplierPaymentId: SupplierPaymentId;
  readonly amount: Money;
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

export type PurchaseLineState = {
  readonly lineId: PurchaseLineId;
  readonly productId: ProductId;
  readonly productName: string;
  readonly quantity: Quantity;
  readonly unitPrice: Money;
  readonly lineTotal: Money;
};

export type PurchaseVoidState = {
  readonly id: PurchaseVoidId;
  readonly workspaceId: WorkspaceId;
  readonly purchaseId: PurchaseId;
  readonly reasonCode: PurchaseVoidReasonCode;
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
  readonly amount: Money;
  /** The approved workspace strategy used for a cross-dimension correction. */
  readonly policyVersionId: WorkspacePolicyVersionId | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
};

export type PurchaseState = {
  readonly id: PurchaseId;
  readonly workspaceId: WorkspaceId;
  readonly supplierId: SupplierId;
  readonly status: PurchaseStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly PurchaseLineState[];
  readonly totalAmount: Money;
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
  readonly dueAt: IsoInstant | null;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly confirmedAt: IsoInstant | null;
  readonly discardedAt: IsoInstant | null;
  readonly replacesPurchaseId: PurchaseId | null;
  readonly voidRecord: PurchaseVoidState | null;
};

export type CustomerOrderLineState = {
  readonly lineId: CustomerOrderLineId;
  readonly productId: ProductId | null;
  readonly productName: string;
  readonly quantity: Quantity;
  readonly agreedUnitPrice: Money | null;
  readonly lineTotal: Money | null;
};

export type CustomerOrderState = {
  readonly id: CustomerOrderId;
  readonly workspaceId: WorkspaceId;
  readonly customerId: CustomerId | null;
  readonly channel: CustomerOrderChannel;
  readonly status: CustomerOrderStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly CustomerOrderLineState[];
  readonly totalAmount: Money | null;
  readonly note: string | null;
  readonly paymentTermsSnapshot: {
    readonly label: string;
    readonly dueAt: IsoInstant | null;
  } | null;
  readonly evidenceReferences: readonly string[];
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly confirmedAt: IsoInstant | null;
  readonly cancelledAt: IsoInstant | null;
  readonly cancellationReason: string | null;
  readonly replacesCustomerOrderId: CustomerOrderId | null;
};

export type SupplyCommitmentLineState = {
  readonly lineId: SupplyCommitmentLineId;
  readonly productId: ProductId | null;
  readonly qualityGradeId: QualityGradeId | null;
  readonly productName: string;
  readonly quantity: Quantity;
  readonly agreedUnitPrice: Money | null;
  readonly lineTotal: Money | null;
};

export type SupplyCommitmentState = {
  readonly id: SupplyCommitmentId;
  readonly workspaceId: WorkspaceId;
  readonly supplierId: SupplierId;
  readonly status: SupplyCommitmentStatus;
  readonly currency: CurrencyCode;
  readonly lines: readonly SupplyCommitmentLineState[];
  readonly totalAmount: Money | null;
  readonly expectedArrivalAt: IsoInstant | null;
  readonly paymentTermsSnapshot: {
    readonly label: string;
    readonly dueAt: IsoInstant | null;
  } | null;
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly confirmedAt: IsoInstant | null;
  readonly cancelledAt: IsoInstant | null;
  readonly cancellationReason: string | null;
  readonly replacesSupplyCommitmentId: SupplyCommitmentId | null;
};

export type PurchaseReceiptLineState = {
  readonly receiptLineId: PurchaseReceiptLineId;
  readonly purchaseLineId: PurchaseLineId;
  readonly productId: ProductId;
  readonly qualityGradeId: QualityGradeId | null;
  readonly qualityGradeName: string | null;
  readonly quantity: Quantity;
};
export type PurchaseReceiptReversalState = {
  readonly id: PurchaseReceiptReversalId;
  readonly workspaceId: WorkspaceId;
  readonly receiptId: PurchaseReceiptId;
  readonly reasonCode: string;
  readonly reason: string;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
  readonly evidenceReferences: readonly string[];
};
export type PurchaseReceiptState = {
  readonly id: PurchaseReceiptId;
  readonly workspaceId: WorkspaceId;
  readonly purchaseId: PurchaseId;
  readonly lines: readonly PurchaseReceiptLineState[];
  readonly note: string | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
  readonly evidenceReferences: readonly string[];
  readonly reversal: PurchaseReceiptReversalState | null;
};
export type InventoryMovementState = {
  readonly id: InventoryMovementId;
  readonly workspaceId: WorkspaceId;
  readonly productId: ProductId;
  readonly qualityGradeId: QualityGradeId | null;
  readonly qualityGradeName: string | null;
  readonly quantity: Quantity;
  readonly sourceType: InventoryMovementSourceType;
  readonly sourceId: string;
  readonly sourceLineId: string | null;
  readonly reversalOfMovementId: InventoryMovementId | null;
  readonly reasonCode: string | null;
  readonly reason: string | null;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
  readonly commandId: CommandId;
};

export type DeliveryReturnState = {
  readonly id: DeliveryReturnId;
  readonly workspaceId: WorkspaceId;
  readonly deliveryId: DeliveryId;
  readonly lines: readonly {
    readonly deliveryLineId: DeliveryLineId;
    readonly quantity: Quantity;
  }[];
  readonly reason: string;
  readonly evidenceReferences: readonly string[];
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly actorId: ActorId;
};

export type DeliveryState = {
  readonly id: DeliveryId;
  readonly workspaceId: WorkspaceId;
  readonly saleId: SaleId;
  readonly status: DeliveryStatus;
  readonly lines: readonly {
    readonly deliveryLineId: DeliveryLineId;
    readonly saleLineId: SaleLineId;
    readonly productId: ProductId;
    readonly productName: string;
    readonly qualityGradeId: QualityGradeId | null;
    readonly qualityGradeName: string | null;
    readonly quantity: Quantity;
  }[];
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
  readonly cancellationReason: string | null;
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly dispatchedAt: IsoInstant | null;
  readonly deliveredAt: IsoInstant | null;
  readonly actorId: ActorId;
  readonly returns: readonly DeliveryReturnState[];
};

export type SaleLineState = {
  readonly lineId: SaleLineId;
  readonly productId: ProductId | null;
  /** Snapshot taken at entry time; later catalogue edits must not change it (ASM-008). */
  readonly productName: string;
  readonly qualityGradeId: QualityGradeId | null;
  readonly qualityGradeName: string | null;
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
  readonly evidenceReferences: readonly string[];
  /** Always the full posted total, taken from the sale, never from the caller. */
  readonly amount: Money;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  /** The accountable actor; only they may continue this correction with a replacement. */
  readonly actorId: ActorId;
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
  readonly evidenceReferences: readonly string[];
  readonly version: number;
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
  readonly postedAt: IsoInstant | null;
  readonly discardedAt: IsoInstant | null;
  /** Null means no payment term was agreed, and nothing is overdue (BR-SALE-017). */
  readonly dueAt: IsoInstant | null;
  /** Snapshot of how the due date was established at posting. */
  readonly paymentTermsPolicyVersionId?: WorkspacePolicyVersionId | null;
  readonly paymentTermsSource?: PaymentTermSource | null;
  /** Snapshot of the credit-control policy consumed at posting, if any. */
  readonly creditLimitPolicyVersionId?: WorkspacePolicyVersionId | null;
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
  readonly cashAccountId?: CashAccountId | null;
  readonly payerName: string | null;
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
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
  readonly evidenceReferences: readonly string[];
  readonly transactionTime: IsoInstant;
  readonly recordedAt: IsoInstant;
};

/** A payment plus the reversal record produced alongside it, when there is one. */
export type PaymentWithReversal = {
  readonly payment: PaymentState;
  readonly reversal: PaymentReversalState;
};
