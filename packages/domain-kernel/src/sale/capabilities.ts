import type { Capability, SaleCapabilities, SaleId, SaleStatus } from "@vuarau/domain-contracts";
import { ALLOWED, denied } from "@vuarau/domain-contracts";
import type { SaleState } from "../shared/state.ts";
import { validateSaleLines } from "./sale-lines.ts";

/**
 * Capabilities are computed from the same checks the decision functions perform,
 * so a greyed-out button and a server refusal always agree (ADR-0003).
 *
 * They are a rendering hint, never a substitute for validation: by the time the
 * user taps, another worker may have posted or voided the sale.
 *
 * These are **state** capabilities only. Whether the caller's role may post or
 * void at all is an authority question, answered separately from the role table
 * (BR-AUTH-004) — a client needs both, and the application layer combines them.
 */

/**
 * The facts a capability needs, which is strictly less than a whole sale.
 *
 * A list read has the status, the line count and whether a void exists, but not
 * the lines themselves — loading them would be an N+1 across the page. Naming
 * what the answer actually depends on lets both callers use one implementation
 * rather than a list growing its own approximate copy.
 */
export type SaleCapabilityFacts = {
  readonly saleId: SaleId;
  readonly status: SaleStatus;
  readonly lineCount: number;
  readonly isVoided: boolean;
};

export function factsFromSale(sale: SaleState): SaleCapabilityFacts {
  return {
    saleId: sale.id,
    status: sale.status,
    lineCount: sale.lines.length,
    isVoided: sale.voidRecord !== null,
  };
}

export function canPostSaleFacts(facts: SaleCapabilityFacts): Capability {
  if (facts.status === "posted") {
    return denied("SALE_ALREADY_POSTED", { saleId: facts.saleId });
  }
  if (facts.status === "discarded") {
    return denied("SALE_ALREADY_DISCARDED", { saleId: facts.saleId });
  }
  if (facts.lineCount === 0) {
    return denied("SALE_EMPTY", { saleId: facts.saleId });
  }
  return ALLOWED;
}

/** Editing and discarding are the same question: is this still a live draft? */
export function canEditDraftFacts(facts: SaleCapabilityFacts): Capability {
  if (facts.status === "posted") {
    return denied("SALE_ALREADY_POSTED", { saleId: facts.saleId });
  }
  if (facts.status === "discarded") {
    return denied("SALE_ALREADY_DISCARDED", { saleId: facts.saleId });
  }
  return ALLOWED;
}

export function canVoidSaleFacts(facts: SaleCapabilityFacts): Capability {
  if (facts.status !== "posted") {
    return denied("SALE_NOT_POSTED", { saleId: facts.saleId, status: facts.status });
  }
  if (facts.isVoided) {
    return denied("SALE_ALREADY_VOIDED", { saleId: facts.saleId });
  }
  return ALLOWED;
}

/**
 * The full-state answer: everything the facts version checks, **plus** line
 * validity, which only a caller holding the lines can check.
 *
 * A list therefore returns `allowed` where this would return `SALE_LINE_INVALID`.
 * That is the correct direction to be wrong in — a capability is advisory and the
 * command re-validates from the aggregate it loads inside the transaction — and
 * it is possible only for a draft stored before BR-SALE-003 was enforced, since
 * every write path validates lines on the way in.
 */
export function canPostSale(sale: SaleState): Capability {
  const fromFacts = canPostSaleFacts(factsFromSale(sale));
  if (!fromFacts.allowed) {
    return fromFacts;
  }

  const lines = validateSaleLines(sale.lines, sale.currency);
  if (!lines.ok) {
    return denied(lines.error.code, lines.error.details ?? {});
  }

  return ALLOWED;
}

export function canVoidSale(sale: SaleState): Capability {
  return canVoidSaleFacts(factsFromSale(sale));
}

/** The shape shared by both, so a list and a detail screen render identically. */
function capabilitiesFrom(
  post: Capability,
  voidSale: Capability,
  editDraft: Capability,
): SaleCapabilities {
  return {
    post,
    void: voidSale,
    // Editing and discarding ask the same question, so they get the same answer.
    // They are separate fields because they are separate buttons.
    edit: editDraft,
    discard: editDraft,
  };
}

export function saleCapabilities(sale: SaleState): SaleCapabilities {
  const facts = factsFromSale(sale);
  return capabilitiesFrom(canPostSale(sale), canVoidSale(sale), canEditDraftFacts(facts));
}

/** For list rows, which hold facts rather than a whole aggregate. */
export function saleSummaryCapabilities(facts: SaleCapabilityFacts): SaleCapabilities {
  return capabilitiesFrom(
    canPostSaleFacts(facts),
    canVoidSaleFacts(facts),
    canEditDraftFacts(facts),
  );
}
