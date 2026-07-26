import type { CreateSaleDraftCommand, IsoInstant } from "@vuarau/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { SaleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { ok } from "../shared/result.ts";
import { calculateSaleTotal, validateSaleLines } from "./sale-lines.ts";

export type CreateSaleDraftInput = {
  readonly command: CreateSaleDraftCommand;
  /** Server clock, read once per command and passed in — the kernel reads no clock. */
  readonly recordedAt: IsoInstant;
};

/**
 * T-SALE-001 — creates a draft sale.
 *
 * A draft may be empty (BR-SALE-002 applies at posting, not here) and moves **no
 * money at all**: `accountEntries` is always empty (BR-SALE-010). That is what
 * makes a draft safe to be wrong — a worker mid-typing has half a load at a
 * guessed price, and none of it should touch a balance.
 *
 * The receivable arises at posting (ASM-002).
 */
export function decideCreateSaleDraft({
  command,
  recordedAt,
}: CreateSaleDraftInput): DomainResult<Decision<SaleState>> {
  const { payload } = command;

  const lines = validateSaleLines(payload.lines, payload.currency);
  if (!lines.ok) {
    return lines;
  }

  const totalAmount = calculateSaleTotal(lines.value, payload.currency);

  const sale: SaleState = {
    id: payload.saleId,
    workspaceId: command.workspaceId,
    customerId: payload.customerId,
    status: "draft",
    currency: payload.currency,
    lines: lines.value,
    totalAmount,
    note: payload.note,
    version: 1,
    transactionTime: command.occurredAt,
    recordedAt,
    postedAt: null,
    dueAt: payload.dueAt,
    replacesSaleId: payload.replacesSaleId,
    voidRecord: null,
  };

  return ok({
    aggregate: sale,
    accountEntries: [],
    audit: {
      aggregateType: "sale",
      aggregateId: sale.id,
      action: "sale.draft_created",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        status: sale.status,
        lineCount: sale.lines.length,
        totalMinor: totalAmount.amountMinor,
        currency: sale.currency,
        replacesSaleId: sale.replacesSaleId,
      },
      reason: null,
    },
  });
}
