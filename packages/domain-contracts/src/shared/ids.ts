import { z } from "zod";

/**
 * Every identifier in the system is a branded UUID.
 *
 * Branding is not decoration: `CustomerId` and `OrderId` are both strings at
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

export const orderIdSchema = z.uuid().brand<"OrderId">();
export type OrderId = z.infer<typeof orderIdSchema>;

export const orderLineIdSchema = z.uuid().brand<"OrderLineId">();
export type OrderLineId = z.infer<typeof orderLineIdSchema>;

export const paymentIdSchema = z.uuid().brand<"PaymentId">();
export type PaymentId = z.infer<typeof paymentIdSchema>;

export const paymentReversalIdSchema = z.uuid().brand<"PaymentReversalId">();
export type PaymentReversalId = z.infer<typeof paymentReversalIdSchema>;

export const debtLedgerEntryIdSchema = z.uuid().brand<"DebtLedgerEntryId">();
export type DebtLedgerEntryId = z.infer<typeof debtLedgerEntryIdSchema>;

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
