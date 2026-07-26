import type { AdjustCustomerDebtCommand, IsoInstant } from "@vuarau/domain-contracts";
import type { Decision, LedgerEntryDraft } from "../shared/effects.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";
import { negateMoney } from "../shared/money.ts";

export type AdjustDebtInput = {
  readonly command: AdjustCustomerDebtCommand;
  readonly recordedAt: IsoInstant;
};

/**
 * The only command that moves money with no underlying business document — an
 * opening balance from the paper book, a write-off, a correction to a confirmed
 * order (CASE-SALE-007).
 *
 * It changes no aggregate, so the decision's `aggregate` is `null`: the ledger
 * entry *is* the record. That is why the reason is mandatory and why it is written
 * onto the entry rather than only into the audit log — someone reading the debt
 * book must see why the number moved without joining another table.
 */
export function decideAdjustDebt({
  command,
  recordedAt,
}: AdjustDebtInput): DomainResult<Decision<null>> {
  const { payload } = command;

  if (payload.reason.trim().length === 0) {
    return err("DEBT_ADJUSTMENT_REASON_REQUIRED", "A debt adjustment requires a reason.", {
      customerId: payload.customerId,
    });
  }

  if (!Number.isInteger(payload.amount.amountMinor) || payload.amount.amountMinor <= 0) {
    return err(
      "DEBT_ADJUSTMENT_AMOUNT_INVALID",
      "A debt adjustment amount must be a positive whole number; use `direction` to say which way it moves.",
      { amountMinor: payload.amount.amountMinor },
    );
  }

  const reason = payload.reason.trim();
  const signedAmount =
    payload.direction === "increase" ? payload.amount : negateMoney(payload.amount);

  const ledgerEntry: LedgerEntryDraft = {
    workspaceId: command.workspaceId,
    customerId: payload.customerId,
    amount: signedAmount,
    sourceType: "manual_adjustment",
    sourceId: payload.adjustmentId,
    reversalOfEntryId: null,
    reasonCode: payload.reasonCode,
    reason,
    transactionTime: command.occurredAt,
    recordedAt,
    actorId: command.actorId,
    commandId: command.commandId,
  };

  return ok({
    aggregate: null,
    ledgerEntries: [ledgerEntry],
    audit: {
      aggregateType: "debt",
      aggregateId: payload.customerId,
      action: "debt.adjusted",
      transactionTime: command.occurredAt,
      recordedAt,
      before: null,
      after: {
        direction: payload.direction,
        amountMinor: signedAmount.amountMinor,
        currency: signedAmount.currency,
        reasonCode: payload.reasonCode,
      },
      reason,
    },
  });
}
