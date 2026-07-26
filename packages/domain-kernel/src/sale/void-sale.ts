import type { IsoInstant, VoidSaleCommand } from "@vuarau/domain-contracts";
import { negateMoney } from "../shared/money.ts";
import type { AccountEntryDraft, Decision } from "../shared/effects.ts";
import type { SaleState, SaleVoidState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

export type VoidSaleInput = {
  readonly command: VoidSaleCommand;
  readonly sale: SaleState;
  readonly recordedAt: IsoInstant;
};

/**
 * A void produces a record *and* an aggregate, unlike every other decision in the
 * kernel, because the aggregate it produces is **unchanged**. The sale is not
 * edited by voiding it (BR-SALE-008); the void is written beside it and the
 * sale's financial state is derived from the pair.
 */
export type VoidSaleDecision = Decision<SaleState> & {
  readonly voidRecord: SaleVoidState;
};

/**
 * T-VOID-001 — undoing a posted sale (ADR-0012).
 *
 * The compensation is `−sale.totalAmount`, read from the **stored** sale. Nothing
 * in the command can influence the amount, which is what keeps a void from being
 * a general-purpose way to move a balance — that is `AdjustCustomerDebt`, and it
 * needs a different permission (BR-SALE-012, BR-ACCOUNT-010).
 *
 * Full, never partial. A sale for the wrong amount is voided whole and replaced
 * by a correct one; partial voiding would leave three different claims about what
 * the sale was for, none authoritative.
 */
export function decideVoidSale({
  command,
  sale,
  recordedAt,
}: VoidSaleInput): DomainResult<VoidSaleDecision> {
  // Checked before "already voided": voiding a draft is a different mistake with
  // a different remedy — discard it — and deserves its own answer (BR-SALE-015).
  if (sale.status !== "posted") {
    return err("SALE_NOT_POSTED", "Only a posted sale can be voided; discard a draft instead.", {
      saleId: sale.id,
      status: sale.status,
    });
  }

  if (sale.voidRecord !== null) {
    return err("SALE_ALREADY_VOIDED", "This sale has already been voided.", {
      saleId: sale.id,
      saleVoidId: sale.voidRecord.id,
    });
  }

  // BR-SALE-014. A void with no stated cause is indistinguishable from a
  // customer's balance quietly shrinking.
  const reason = command.payload.reason.trim();
  if (reason.length === 0) {
    return err("SALE_VOID_REASON_REQUIRED", "Voiding a sale requires an explanation.", {
      saleId: sale.id,
      reasonCode: command.payload.reasonCode,
    });
  }

  const voidRecord: SaleVoidState = {
    id: command.payload.saleVoidId,
    workspaceId: sale.workspaceId,
    saleId: sale.id,
    reasonCode: command.payload.reasonCode,
    reason,
    amount: sale.totalAmount,
    transactionTime: command.occurredAt,
    recordedAt,
  };

  // BR-SALE-012 — one entry, the exact negative of the posting, so the two sum to
  // zero for this sale.
  const accountEntry: AccountEntryDraft = {
    workspaceId: sale.workspaceId,
    customerId: sale.customerId,
    amount: negateMoney(sale.totalAmount),
    sourceType: "sale_void",
    sourceId: voidRecord.id,
    reversalOfEntryId: null,
    reasonCode: null,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    // Unchanged, and deliberately so — including the version, which never moves
    // again once a sale is posted.
    aggregate: { ...sale, voidRecord },
    accountEntries: [accountEntry],
    voidRecord,
    audit: {
      aggregateType: "sale",
      aggregateId: sale.id,
      action: "sale.voided",
      transactionTime: command.occurredAt,
      recordedAt,
      before: { financialState: "active", totalMinor: sale.totalAmount.amountMinor },
      after: {
        financialState: "voided",
        compensatedMinor: -sale.totalAmount.amountMinor,
        currency: sale.currency,
        reasonCode: voidRecord.reasonCode,
      },
      reason,
    },
  });
}
