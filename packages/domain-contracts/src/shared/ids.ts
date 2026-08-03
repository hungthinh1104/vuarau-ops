import { z } from "zod";

/**
 * Every identifier in the system is a branded UUID.
 *
 * Branding is not decoration: `CustomerId` and `SaleId` are both strings at
 * runtime, and the single most damaging class of bug in a debt system is passing
 * the wrong one to a ledger write. The brand makes that a compile error.
 *
 * See docs/07-data/data-model.md.
 */

export const workspaceIdSchema = z.uuid().brand<"WorkspaceId">();
export type WorkspaceId = z.infer<typeof workspaceIdSchema>;

/** The authenticated principal performing a command (a depot owner or worker). */
export const actorIdSchema = z.uuid().brand<"ActorId">();
export type ActorId = z.infer<typeof actorIdSchema>;

export const customerIdSchema = z.uuid().brand<"CustomerId">();
export type CustomerId = z.infer<typeof customerIdSchema>;

export const productIdSchema = z.uuid().brand<"ProductId">();
export type ProductId = z.infer<typeof productIdSchema>;

export const priceRuleIdSchema = z.uuid().brand<"PriceRuleId">();
export type PriceRuleId = z.infer<typeof priceRuleIdSchema>;

export const qualityGradeIdSchema = z.uuid().brand<"QualityGradeId">();
export type QualityGradeId = z.infer<typeof qualityGradeIdSchema>;

export const inventoryReclassificationIdSchema = z.uuid().brand<"InventoryReclassificationId">();
export type InventoryReclassificationId = z.infer<typeof inventoryReclassificationIdSchema>;

export const supplierIdSchema = z.uuid().brand<"SupplierId">();
export type SupplierId = z.infer<typeof supplierIdSchema>;

export const supplierPaymentIdSchema = z.uuid().brand<"SupplierPaymentId">();
export type SupplierPaymentId = z.infer<typeof supplierPaymentIdSchema>;

export const supplierPaymentReversalIdSchema = z.uuid().brand<"SupplierPaymentReversalId">();
export type SupplierPaymentReversalId = z.infer<typeof supplierPaymentReversalIdSchema>;

export const supplierAccountEntryIdSchema = z.uuid().brand<"SupplierAccountEntryId">();
export type SupplierAccountEntryId = z.infer<typeof supplierAccountEntryIdSchema>;

export const purchaseIdSchema = z.uuid().brand<"PurchaseId">();
export type PurchaseId = z.infer<typeof purchaseIdSchema>;

export const purchaseLineIdSchema = z.uuid().brand<"PurchaseLineId">();
export type PurchaseLineId = z.infer<typeof purchaseLineIdSchema>;

export const purchaseVoidIdSchema = z.uuid().brand<"PurchaseVoidId">();
export type PurchaseVoidId = z.infer<typeof purchaseVoidIdSchema>;

export const purchaseReceiptIdSchema = z.uuid().brand<"PurchaseReceiptId">();
export type PurchaseReceiptId = z.infer<typeof purchaseReceiptIdSchema>;

export const purchaseReceiptLineIdSchema = z.uuid().brand<"PurchaseReceiptLineId">();
export type PurchaseReceiptLineId = z.infer<typeof purchaseReceiptLineIdSchema>;

export const purchaseReceiptReversalIdSchema = z.uuid().brand<"PurchaseReceiptReversalId">();
export type PurchaseReceiptReversalId = z.infer<typeof purchaseReceiptReversalIdSchema>;

export const inventoryMovementIdSchema = z.uuid().brand<"InventoryMovementId">();
export type InventoryMovementId = z.infer<typeof inventoryMovementIdSchema>;

export const deliveryIdSchema = z.uuid().brand<"DeliveryId">();
export type DeliveryId = z.infer<typeof deliveryIdSchema>;
export const deliveryLineIdSchema = z.uuid().brand<"DeliveryLineId">();
export type DeliveryLineId = z.infer<typeof deliveryLineIdSchema>;
export const deliveryReturnIdSchema = z.uuid().brand<"DeliveryReturnId">();
export type DeliveryReturnId = z.infer<typeof deliveryReturnIdSchema>;
export const documentIdSchema = z.uuid().brand<"DocumentId">();
export type DocumentId = z.infer<typeof documentIdSchema>;
export const documentShareIdSchema = z.uuid().brand<"DocumentShareId">();
export type DocumentShareId = z.infer<typeof documentShareIdSchema>;

export const saleIdSchema = z.uuid().brand<"SaleId">();
export type SaleId = z.infer<typeof saleIdSchema>;

export const saleLineIdSchema = z.uuid().brand<"SaleLineId">();
export type SaleLineId = z.infer<typeof saleLineIdSchema>;

/**
 * A void is its own record with its own identity, not a flag on the sale. That is
 * what lets the sale stay immutable while still being correctable (BR-SALE-012).
 */
export const saleVoidIdSchema = z.uuid().brand<"SaleVoidId">();
export type SaleVoidId = z.infer<typeof saleVoidIdSchema>;

export const paymentIdSchema = z.uuid().brand<"PaymentId">();
export type PaymentId = z.infer<typeof paymentIdSchema>;

export const paymentReversalIdSchema = z.uuid().brand<"PaymentReversalId">();
export type PaymentReversalId = z.infer<typeof paymentReversalIdSchema>;

export const customerAccountEntryIdSchema = z.uuid().brand<"CustomerAccountEntryId">();
export type CustomerAccountEntryId = z.infer<typeof customerAccountEntryIdSchema>;

export const qualityIssueCodeIdSchema = z.uuid().brand<"QualityIssueCodeId">();
export type QualityIssueCodeId = z.infer<typeof qualityIssueCodeIdSchema>;
export const goodsArrivalIdSchema = z.uuid().brand<"GoodsArrivalId">();
export type GoodsArrivalId = z.infer<typeof goodsArrivalIdSchema>;
export const goodsArrivalLineIdSchema = z.uuid().brand<"GoodsArrivalLineId">();
export type GoodsArrivalLineId = z.infer<typeof goodsArrivalLineIdSchema>;
export const goodsArrivalReversalIdSchema = z.uuid().brand<"GoodsArrivalReversalId">();
export type GoodsArrivalReversalId = z.infer<typeof goodsArrivalReversalIdSchema>;
export const qualityInspectionIdSchema = z.uuid().brand<"QualityInspectionId">();
export type QualityInspectionId = z.infer<typeof qualityInspectionIdSchema>;
export const qualityInspectionReversalIdSchema = z.uuid().brand<"QualityInspectionReversalId">();
export type QualityInspectionReversalId = z.infer<typeof qualityInspectionReversalIdSchema>;
export const qualityDispositionIdSchema = z.uuid().brand<"QualityDispositionId">();
export type QualityDispositionId = z.infer<typeof qualityDispositionIdSchema>;
export const qualityDispositionAllocationIdSchema = z
  .uuid()
  .brand<"QualityDispositionAllocationId">();
export type QualityDispositionAllocationId = z.infer<typeof qualityDispositionAllocationIdSchema>;
export const qualityDispositionReversalIdSchema = z.uuid().brand<"QualityDispositionReversalId">();
export type QualityDispositionReversalId = z.infer<typeof qualityDispositionReversalIdSchema>;

export const costObservationIdSchema = z.uuid().brand<"CostObservationId">();
export type CostObservationId = z.infer<typeof costObservationIdSchema>;
export const reconciliationObservationIdSchema = z.uuid().brand<"ReconciliationObservationId">();
export type ReconciliationObservationId = z.infer<typeof reconciliationObservationIdSchema>;
export const debtObservationIdSchema = z.uuid().brand<"DebtObservationId">();
export type DebtObservationId = z.infer<typeof debtObservationIdSchema>;
export const supplyCommitmentObservationIdSchema = z
  .uuid()
  .brand<"SupplyCommitmentObservationId">();
export type SupplyCommitmentObservationId = z.infer<typeof supplyCommitmentObservationIdSchema>;
export const supplierObservationIdSchema = z.uuid().brand<"SupplierObservationId">();
export type SupplierObservationId = z.infer<typeof supplierObservationIdSchema>;
export const demandObservationIdSchema = z.uuid().brand<"DemandObservationId">();
export type DemandObservationId = z.infer<typeof demandObservationIdSchema>;
export const workspacePolicyVersionIdSchema = z.uuid().brand<"WorkspacePolicyVersionId">();
export type WorkspacePolicyVersionId = z.infer<typeof workspacePolicyVersionIdSchema>;

export const cashAccountIdSchema = z.uuid().brand<"CashAccountId">();
export type CashAccountId = z.infer<typeof cashAccountIdSchema>;
export const cashMovementIdSchema = z.uuid().brand<"CashMovementId">();
export type CashMovementId = z.infer<typeof cashMovementIdSchema>;
export const expenseIdSchema = z.uuid().brand<"ExpenseId">();
export type ExpenseId = z.infer<typeof expenseIdSchema>;
export const expenseReversalIdSchema = z.uuid().brand<"ExpenseReversalId">();
export type ExpenseReversalId = z.infer<typeof expenseReversalIdSchema>;
export const cashTransferIdSchema = z.uuid().brand<"CashTransferId">();
export type CashTransferId = z.infer<typeof cashTransferIdSchema>;
export const cashTransferReversalIdSchema = z.uuid().brand<"CashTransferReversalId">();
export type CashTransferReversalId = z.infer<typeof cashTransferReversalIdSchema>;
export const cashAdjustmentIdSchema = z.uuid().brand<"CashAdjustmentId">();
export type CashAdjustmentId = z.infer<typeof cashAdjustmentIdSchema>;

export const commandIdSchema = z.uuid().brand<"CommandId">();
export type CommandId = z.infer<typeof commandIdSchema>;

export const auditRecordIdSchema = z.uuid().brand<"AuditRecordId">();
export type AuditRecordId = z.infer<typeof auditRecordIdSchema>;

/**
 * Client-supplied retry token. Not a UUID: an offline mobile client may derive it
 * from a device id plus a local sequence number, and we must accept that.
 */
export const idempotencyKeySchema = z.string().min(8).max(200).brand<"IdempotencyKey">();
export type IdempotencyKey = z.infer<typeof idempotencyKeySchema>;
