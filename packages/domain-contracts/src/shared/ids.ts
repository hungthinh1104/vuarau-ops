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
