import { z } from "zod";
import {
  customerIdSchema,
  productIdSchema,
  saleIdSchema,
  saleLineIdSchema,
  saleVoidIdSchema,
  workspaceIdSchema,
} from "../shared/ids.ts";
import { currencyCodeSchema, moneySchema } from "../shared/money.ts";
import { quantitySchema } from "../shared/quantity.ts";
import { isoInstantSchema } from "../shared/time.ts";
import { defineCommand, defineVersionedCommand } from "../shared/command.ts";
import { capabilitySchema } from "../shared/capability.ts";

/**
 * A **sale** is a completed transaction: goods handed over, price agreed
 * (ADR-0013). It is not a request for goods — that is a future `CustomerOrder`.
 *
 * Stored lifecycle: `draft → posted`, and `posted` is terminal because a posted
 * sale is immutable (BR-SALE-008). Everything that happens afterwards — voiding,
 * replacement — is recorded beside it.
 *
 * Deliberately free of allocation, picking, delivery, invoice, and payment state:
 * those are separate lifecycle dimensions and adding them here is how status
 * enums rot. See docs/03-state-machines/sale-state-machine.md.
 */
export const SALE_STATUSES = ["draft", "posted"] as const;
export const saleStatusSchema = z.enum(SALE_STATUSES);
export type SaleStatus = z.infer<typeof saleStatusSchema>;

/**
 * Whether the receivable still stands. **Derived** from the presence of a void
 * record, never stored — a stored flag would be a second place the truth lives,
 * and keeping it in step would mean updating a row promised to be immutable
 * (BR-SALE-013).
 *
 * A draft has no financial state: it has no financial effect to have one about.
 */
export const SALE_FINANCIAL_STATES = ["active", "voided"] as const;
export const saleFinancialStateSchema = z.enum(SALE_FINANCIAL_STATES);
export type SaleFinancialState = z.infer<typeof saleFinancialStateSchema>;

/**
 * Derived from `dueAt` and the reading clock (BR-SALE-017).
 *
 * `no_due_date` is **not** a synonym for `overdue`. Most depot sales carry no
 * term at all, and calling those overdue would put every customer on a chase list
 * the day they buy.
 */
export const SALE_DUE_STATES = ["no_due_date", "due", "overdue"] as const;
export const saleDueStateSchema = z.enum(SALE_DUE_STATES);
export type SaleDueState = z.infer<typeof saleDueStateSchema>;

/**
 * Product name and unit price are SNAPSHOTS taken when the line was entered and
 * re-affirmed at posting (BR-SALE-011). A posted sale is a historical fact; later
 * edits to the product catalogue must not retroactively change what a customer
 * owes (ASM-008).
 */
export const saleLineInputSchema = z.object({
  lineId: saleLineIdSchema,
  productId: productIdSchema,
  productName: z.string().trim().min(1).max(200),
  quantity: quantitySchema,
  /**
   * Price for one whole unit (one kg, one bó, one thùng). Zero is allowed —
   * depots give things away. Negative is refused by the domain with
   * `SALE_LINE_INVALID` (BR-SALE-003), not by this schema, so the client gets
   * the specific code and the offending line index.
   */
  unitPrice: moneySchema,
});
export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

export const createSaleDraftPayloadSchema = z.object({
  saleId: saleIdSchema,
  customerId: customerIdSchema,
  currency: currencyCodeSchema,
  /** A draft may legitimately be empty — the worker is still typing. */
  lines: z.array(saleLineInputSchema).max(200),
  note: z.string().trim().max(1000).nullable().default(null),
  /**
   * Optional payment term. Null means no term was agreed, and a sale with no term
   * is never overdue (BR-SALE-017). Most depot sales are this case.
   */
  dueAt: isoInstantSchema.nullable().default(null),
  /**
   * Set only when this draft corrects a sale that was voided (BR-SALE-016). The
   * link is written once and never rewritten; the voided sale is not modified to
   * point forward, because that would be an update to an immutable row.
   */
  replacesSaleId: saleIdSchema.nullable().default(null),
});
export type CreateSaleDraftPayload = z.infer<typeof createSaleDraftPayloadSchema>;

export const createSaleDraftCommandSchema = defineCommand(createSaleDraftPayloadSchema);
export type CreateSaleDraftCommand = z.infer<typeof createSaleDraftCommandSchema>;

/**
 * Nothing about the sale's contents is here. Posting commits **what is stored**,
 * not what the client believes is stored; accepting lines would let a stale screen
 * post a total nobody agreed to.
 */
export const postSalePayloadSchema = z.object({
  saleId: saleIdSchema,
});
export type PostSalePayload = z.infer<typeof postSalePayloadSchema>;

/** Posting mutates an existing aggregate, so the version is mandatory. */
export const postSaleCommandSchema = defineVersionedCommand(postSalePayloadSchema);
export type PostSaleCommand = z.infer<typeof postSaleCommandSchema>;

/**
 * Why a sale was voided. The code is what a report groups by; the free text is
 * what the person disputing the balance six months later actually needs. A void
 * with only a code produces reports nobody can act on; one with only text
 * produces a list nobody can count (BR-SALE-014).
 */
export const SALE_VOID_REASON_CODES = [
  "wrong_amount",
  "wrong_customer",
  "goods_returned",
  "duplicate_entry",
  "cancelled_by_customer",
  "other",
] as const;
export const saleVoidReasonCodeSchema = z.enum(SALE_VOID_REASON_CODES);
export type SaleVoidReasonCode = z.infer<typeof saleVoidReasonCodeSchema>;

/**
 * Note what is absent: no amount, and no `expectedVersion`.
 *
 * The compensation is computed from the **stored** posted total, so a void cannot
 * be used to move an arbitrary sum (BR-SALE-012) — that is what
 * `AdjustCustomerDebt` is for, and it needs a different permission. And a posted
 * sale's version never moves again, so there is no lost update to guard against;
 * concurrent voids are stopped by a row lock and `UNIQUE (sale_id)` on the void
 * table (BR-SALE-013).
 */
export const voidSalePayloadSchema = z.object({
  /** Client-supplied identity of the void; becomes the account entry `sourceId`. */
  saleVoidId: saleVoidIdSchema,
  saleId: saleIdSchema,
  reasonCode: saleVoidReasonCodeSchema,
  /**
   * Mandatory and non-blank, enforced by the domain for a stable code
   * (BR-SALE-014) rather than by this schema.
   */
  reason: z.string().max(500),
});
export type VoidSalePayload = z.infer<typeof voidSalePayloadSchema>;

export const voidSaleCommandSchema = defineCommand(voidSalePayloadSchema);
export type VoidSaleCommand = z.infer<typeof voidSaleCommandSchema>;

export const saleLineDtoSchema = saleLineInputSchema.extend({
  lineTotal: moneySchema,
});
export type SaleLineDto = z.infer<typeof saleLineDtoSchema>;

export const saleVoidDtoSchema = z.object({
  id: saleVoidIdSchema,
  saleId: saleIdSchema,
  reasonCode: saleVoidReasonCodeSchema,
  reason: z.string(),
  /** The amount put back on the account. Always the full posted total. */
  amount: moneySchema,
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
});
export type SaleVoidDto = z.infer<typeof saleVoidDtoSchema>;

export const saleCapabilitiesSchema = z.object({
  post: capabilitySchema,
  void: capabilitySchema,
  edit: capabilitySchema,
  discard: capabilitySchema,
});
export type SaleCapabilities = z.infer<typeof saleCapabilitiesSchema>;

export const saleDtoSchema = z.object({
  id: saleIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  status: saleStatusSchema,
  /** Null while `draft` — a draft has no financial effect to have a state about. */
  financialState: saleFinancialStateSchema.nullable(),
  dueState: saleDueStateSchema,
  currency: currencyCodeSchema,
  lines: z.array(saleLineDtoSchema),
  totalAmount: moneySchema,
  note: z.string().nullable(),
  version: z.int().nonnegative(),
  /** When the sale happened, per the worker. Drives aging. */
  transactionTime: isoInstantSchema,
  /** When we accepted the draft. */
  recordedAt: isoInstantSchema,
  postedAt: isoInstantSchema.nullable(),
  dueAt: isoInstantSchema.nullable(),
  replacesSaleId: saleIdSchema.nullable(),
  /** Present iff this sale was voided. The sale row itself is never touched. */
  voidRecord: saleVoidDtoSchema.nullable(),
  capabilities: saleCapabilitiesSchema,
});
export type SaleDto = z.infer<typeof saleDtoSchema>;

export const saleDraftCreatedEventSchema = z.object({
  type: z.literal("sale.draft_created"),
  saleId: saleIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  totalAmount: moneySchema,
  transactionTime: isoInstantSchema,
});

export const salePostedEventSchema = z.object({
  type: z.literal("sale.posted"),
  saleId: saleIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  totalAmount: moneySchema,
  transactionTime: isoInstantSchema,
});

export const saleVoidedEventSchema = z.object({
  type: z.literal("sale.voided"),
  saleId: saleIdSchema,
  saleVoidId: saleVoidIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  amount: moneySchema,
  reasonCode: saleVoidReasonCodeSchema,
  transactionTime: isoInstantSchema,
});

export const saleEventSchema = z.discriminatedUnion("type", [
  saleDraftCreatedEventSchema,
  salePostedEventSchema,
  saleVoidedEventSchema,
]);
export type SaleEvent = z.infer<typeof saleEventSchema>;
