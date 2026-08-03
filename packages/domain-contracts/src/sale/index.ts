import { z } from "zod";
import {
  customerIdSchema,
  productIdSchema,
  qualityGradeIdSchema,
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
import { pageRequestSchema } from "../shared/pagination.ts";
import { balanceClassificationSchema } from "../account/index.ts";
import { evidenceReferencesDtoSchema, evidenceReferencesInputSchema } from "../shared/evidence.ts";

/**
 * A **sale** is the depot's recognized commercial transaction under its validated
 * posting policy (ADR-0013/ADR-0014). It is not a request for goods — that is a
 * future `CustomerOrder` — and it does not claim physical handover; Delivery owns
 * fulfilment truth.
 *
 * Stored lifecycle: `draft → posted` or `draft → discarded`. Both ends are
 * terminal — a posted sale is immutable (BR-SALE-008), and a discarded one is a
 * decision somebody made that stays on the record.
 *
 * Everything that happens to a posted sale afterwards — voiding, replacement — is
 * recorded beside it, never in it.
 *
 * `discarded` is a lifecycle value rather than a deletion: "somebody entered this
 * and then thought better of it" is information, and a discarded draft
 * resubmitted by an offline client has to be recognised as a replay rather than
 * accepted as new (BR-SALE-018).
 *
 * Deliberately free of allocation, picking, delivery, invoice, and payment state:
 * those are separate lifecycle dimensions and adding them here is how status
 * enums rot. See docs/03-state-machines/sale-state-machine.md.
 */
export const SALE_STATUSES = ["draft", "posted", "discarded"] as const;
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
  /**
   * Nullable only while a worker is typing a draft. Posting requires an active
   * workspace Product and re-affirms this canonical identity before any debt is
   * created. `productName` remains the immutable human-readable snapshot.
   */
  productId: productIdSchema.nullable().default(null),
  productName: z.string().trim().min(1).max(200),
  /** Canonical physical grade; nullable only for drafts and legacy posted history. */
  qualityGradeId: qualityGradeIdSchema.nullable().default(null),
  /** Immutable label snapshot so later grade renaming does not rewrite history. */
  qualityGradeName: z.string().trim().min(1).max(100).nullable().default(null),
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
  /** Source-linked operational evidence; it has no money or fulfilment effect. */
  evidenceReferences: evidenceReferencesInputSchema,
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
 * Replaces the draft's line set wholesale rather than patching individual lines.
 *
 * A per-line patch would need a merge rule for two workers editing the same draft,
 * and any merge rule produces a total neither of them typed. Whole replacement
 * plus `expectedVersion` means one of them wins and the other is told to reload
 * (BR-SALE-018).
 */
export const updateSaleDraftPayloadSchema = z.object({
  saleId: saleIdSchema,
  lines: z.array(saleLineInputSchema).max(200),
  note: z.string().trim().max(1000).nullable().default(null),
  evidenceReferences: evidenceReferencesInputSchema,
  dueAt: isoInstantSchema.nullable().default(null),
});
export type UpdateSaleDraftPayload = z.infer<typeof updateSaleDraftPayloadSchema>;

export const updateSaleDraftCommandSchema = defineVersionedCommand(updateSaleDraftPayloadSchema);
export type UpdateSaleDraftCommand = z.infer<typeof updateSaleDraftCommandSchema>;

export const discardSaleDraftPayloadSchema = z.object({
  saleId: saleIdSchema,
  /** Optional: unlike a void, discarding moves no money and owes no explanation. */
  reason: z.string().trim().max(500).nullable().default(null),
});
export type DiscardSaleDraftPayload = z.infer<typeof discardSaleDraftPayloadSchema>;

export const discardSaleDraftCommandSchema = defineVersionedCommand(discardSaleDraftPayloadSchema);
export type DiscardSaleDraftCommand = z.infer<typeof discardSaleDraftCommandSchema>;

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
  evidenceReferences: evidenceReferencesInputSchema,
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
  evidenceReferences: evidenceReferencesDtoSchema,
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
  evidenceReferences: evidenceReferencesDtoSchema,
  version: z.int().nonnegative(),
  /** When the sale happened, per the worker. Drives aging. */
  transactionTime: isoInstantSchema,
  /** When we accepted the draft. */
  recordedAt: isoInstantSchema,
  postedAt: isoInstantSchema.nullable(),
  discardedAt: isoInstantSchema.nullable(),
  dueAt: isoInstantSchema.nullable(),
  replacesSaleId: saleIdSchema.nullable(),
  /** Present iff this sale was voided. The sale row itself is never touched. */
  voidRecord: saleVoidDtoSchema.nullable(),
  capabilities: saleCapabilitiesSchema,
});
export type SaleDto = z.infer<typeof saleDtoSchema>;

/** Historical names are optional typing help only; price remains customer-local. */
export const saleCaptureContextInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  query: z.string().trim().max(200).default(""),
  limit: z.int().min(1).max(12).default(10),
});
export type SaleCaptureContextInput = z.infer<typeof saleCaptureContextInputSchema>;

export const customerPriceHistoryDtoSchema = z.object({
  productId: productIdSchema.nullable(),
  productName: z.string(),
  unit: z.string(),
  lastUnitPrice: moneySchema,
  lastTransactionTime: isoInstantSchema,
  sourceSaleId: saleIdSchema,
});
export type CustomerPriceHistoryDto = z.infer<typeof customerPriceHistoryDtoSchema>;

export const workspaceProductHistoryDtoSchema = z.object({
  productId: productIdSchema.nullable(),
  productName: z.string(),
  unit: z.string(),
  lastUnitPrice: z.null(),
});
export type WorkspaceProductHistoryDto = z.infer<typeof workspaceProductHistoryDtoSchema>;

export const saleCaptureContextDtoSchema = z.object({
  customerHistory: z.array(customerPriceHistoryDtoSchema),
  workspaceHistory: z.array(workspaceProductHistoryDtoSchema),
});
export type SaleCaptureContextDto = z.infer<typeof saleCaptureContextDtoSchema>;

export const saleDetailInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema,
});
export type SaleDetailInput = z.infer<typeof saleDetailInputSchema>;

/** Presentation model for one posted sale; it is not an accounting invoice. */
export const saleDetailDtoSchema = z.object({
  sale: saleDtoSchema,
  displayReference: z.string(),
  customer: z.object({
    id: customerIdSchema,
    displayName: z.string(),
    phone: z.string().nullable(),
  }),
  workspace: z.object({ id: workspaceIdSchema, name: z.string() }),
  accountEffect: z
    .object({
      balanceBefore: moneySchema,
      change: moneySchema,
      balanceAfter: moneySchema,
      classificationAfter: balanceClassificationSchema,
      accountEntryId: z.string(),
    })
    .nullable(),
  correction: z.object({
    voidRecord: saleVoidDtoSchema.nullable(),
    replacedBySaleId: saleIdSchema.nullable(),
  }),
});
export type SaleDetailDto = z.infer<typeof saleDetailDtoSchema>;

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

// --- reads -------------------------------------------------------------------

/**
 * UC-SALE-003 — a row in the day's list.
 *
 * Deliberately without `lines`. A list of fifty sales does not need three hundred
 * line rows to render, and loading them would be the classic N+1 that turns a
 * cheap screen into a slow one. `sale.get` returns the lines.
 */
export const saleSummaryDtoSchema = z.object({
  id: saleIdSchema,
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema,
  /** Denormalised for the list only. `sale.get` does not repeat it. */
  customerDisplayName: z.string(),
  status: saleStatusSchema,
  financialState: saleFinancialStateSchema.nullable(),
  dueState: saleDueStateSchema,
  totalAmount: moneySchema,
  lineCount: z.int().nonnegative(),
  version: z.int().nonnegative(),
  transactionTime: isoInstantSchema,
  recordedAt: isoInstantSchema,
  postedAt: isoInstantSchema.nullable(),
  discardedAt: isoInstantSchema.nullable(),
  dueAt: isoInstantSchema.nullable(),
  /** Both directions of the correction chain, so a list can show it (BR-SALE-016). */
  replacesSaleId: saleIdSchema.nullable(),
  replacedBySaleId: saleIdSchema.nullable(),
  capabilities: saleCapabilitiesSchema,
});
export type SaleSummaryDto = z.infer<typeof saleSummaryDtoSchema>;

export const getSaleInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  saleId: saleIdSchema,
});
export type GetSaleInput = z.infer<typeof getSaleInputSchema>;

export const listSalesInputSchema = pageRequestSchema.extend({
  workspaceId: workspaceIdSchema,
  customerId: customerIdSchema.nullable().default(null),
  status: saleStatusSchema.nullable().default(null),
  /**
   * Filters on the **derived** state (BR-SALE-013), so a screen showing "what
   * still stands" does not have to fetch voided sales and drop them client-side.
   */
  financialState: saleFinancialStateSchema.nullable().default(null),
  /** Business time, not recording time: a depot asks "today's sales", meaning
   *  sales that happened today (docs/07-data/time-semantics.md). */
  from: isoInstantSchema.nullable().default(null),
  to: isoInstantSchema.nullable().default(null),
});
export type ListSalesInput = z.infer<typeof listSalesInputSchema>;
