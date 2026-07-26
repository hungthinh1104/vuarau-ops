import type { Capability, SaleCapabilities } from "@vuarau/domain-contracts";
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
export function canPostSale(sale: SaleState): Capability {
  if (sale.status === "posted") {
    return denied("SALE_ALREADY_POSTED", { saleId: sale.id });
  }
  if (sale.lines.length === 0) {
    return denied("SALE_EMPTY", { saleId: sale.id });
  }

  const lines = validateSaleLines(sale.lines, sale.currency);
  if (!lines.ok) {
    return denied(lines.error.code, lines.error.details ?? {});
  }

  return ALLOWED;
}

export function canVoidSale(sale: SaleState): Capability {
  if (sale.status !== "posted") {
    return denied("SALE_NOT_POSTED", { saleId: sale.id, status: sale.status });
  }
  if (sale.voidRecord !== null) {
    return denied("SALE_ALREADY_VOIDED", { saleId: sale.id, saleVoidId: sale.voidRecord.id });
  }
  return ALLOWED;
}

export function saleCapabilities(sale: SaleState): SaleCapabilities {
  return {
    post: canPostSale(sale),
    void: canVoidSale(sale),
    // T-SALE-003/004 are specified but not implemented (BR-SALE-018). The UI
    // learns this from the server rather than hard-coding a roadmap.
    edit: denied("COMMAND_NOT_AVAILABLE", { command: "EditSaleDraft" }),
    discard: denied("COMMAND_NOT_AVAILABLE", { command: "DiscardSaleDraft" }),
  };
}
