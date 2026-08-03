import type {
  DiscardSaleDraftCommand,
  IsoInstant,
  UpdateSaleDraftCommand,
} from "@vuarau/domain-contracts";
import type { Decision } from "../shared/effects.ts";
import type { SaleState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { calculateSaleTotal, validateSaleLines } from "./sale-lines.ts";

/**
 * The guard both draft commands share.
 *
 * Version first (BR-SALE-006): if somebody else changed the draft, "someone else
 * changed this" points the worker at reloading, where "already posted" would send
 * them looking for a button that is no longer there.
 */
function guardDraft(sale: SaleState, expectedVersion: number): DomainResult<null> {
  if (expectedVersion !== sale.version) {
    return err(
      "SALE_VERSION_CONFLICT",
      `Sale was modified by someone else: expected version ${expectedVersion}, found ${sale.version}.`,
      { saleId: sale.id, expectedVersion, actualVersion: sale.version },
    );
  }
  if (sale.status === "posted") {
    // BR-SALE-008 from the command side. A posted sale is a historical claim
    // about what a customer took; the remedy for a wrong one is VoidSale.
    return err("SALE_ALREADY_POSTED", "A posted sale cannot be edited or discarded.", {
      saleId: sale.id,
      status: sale.status,
    });
  }
  if (sale.status === "discarded") {
    return err("SALE_ALREADY_DISCARDED", "This draft was already discarded.", {
      saleId: sale.id,
      status: sale.status,
    });
  }
  return ok(null);
}

export type UpdateSaleDraftInput = {
  readonly command: UpdateSaleDraftCommand;
  readonly sale: SaleState;
  readonly recordedAt: IsoInstant;
};

/**
 * T-SALE-003 — editing a draft.
 *
 * Replaces the line set wholesale. A per-line patch would need a merge rule for
 * two workers editing the same draft, and any merge rule produces a total neither
 * of them typed; whole replacement plus `expectedVersion` means one wins and the
 * other reloads.
 *
 * **No account effect** (BR-SALE-010). A draft moves no money however many times
 * it is edited, which is what makes it safe to be wrong.
 */
export function decideUpdateSaleDraft({
  command,
  sale,
  recordedAt,
}: UpdateSaleDraftInput): DomainResult<Decision<SaleState>> {
  const guard = guardDraft(sale, command.expectedVersion);
  if (!guard.ok) {
    return guard;
  }

  const lines = validateSaleLines(command.payload.lines, sale.currency);
  if (!lines.ok) {
    return lines;
  }
  const totalAmount = calculateSaleTotal(lines.value, sale.currency);

  const edited: SaleState = {
    ...sale,
    lines: lines.value,
    totalAmount,
    note: command.payload.note,
    evidenceReferences: [...(command.payload.evidenceReferences ?? [])],
    dueAt: command.payload.dueAt,
    version: sale.version + 1,
  };

  return ok({
    aggregate: edited,
    accountEntries: [],
    audit: {
      aggregateType: "sale",
      aggregateId: sale.id,
      action: "sale.draft_edited",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { lineCount: sale.lines.length, totalMinor: sale.totalAmount.amountMinor },
      after: { lineCount: edited.lines.length, totalMinor: totalAmount.amountMinor },
      reason: null,
    },
  });
}

export type DiscardSaleDraftInput = {
  readonly command: DiscardSaleDraftCommand;
  readonly sale: SaleState;
  readonly recordedAt: IsoInstant;
};

/**
 * T-SALE-004 — throwing away a draft.
 *
 * A lifecycle value, not a deletion. The row stays, because "somebody entered
 * this and then thought better of it" is information, and because a discarded
 * draft resubmitted by an offline client has to be recognised as a replay rather
 * than accepted as new (BR-SALE-018, BR-COMMAND-001).
 *
 * **No account effect**, and no reason required — unlike a void, discarding moves
 * no money and owes nobody an explanation (BR-SALE-010).
 */
export function decideDiscardSaleDraft({
  command,
  sale,
  recordedAt,
}: DiscardSaleDraftInput): DomainResult<Decision<SaleState>> {
  const guard = guardDraft(sale, command.expectedVersion);
  if (!guard.ok) {
    return guard;
  }

  const discarded: SaleState = {
    ...sale,
    status: "discarded",
    version: sale.version + 1,
    discardedAt: command.occurredAt,
  };

  return ok({
    aggregate: discarded,
    accountEntries: [],
    audit: {
      aggregateType: "sale",
      aggregateId: sale.id,
      action: "sale.discarded",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { status: sale.status, totalMinor: sale.totalAmount.amountMinor },
      after: { status: "discarded" },
      reason: command.payload.reason,
    },
  });
}
