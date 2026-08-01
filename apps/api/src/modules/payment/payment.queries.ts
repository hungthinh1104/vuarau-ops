import type {
  GetPaymentInput,
  ListPaymentsInput,
  Page,
  PaymentSummaryDto,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { err, paymentSummaryCapabilities, subtractMoney } from "@vuarau/domain-kernel";
import type { PaymentSummaryRow } from "../../infrastructure/persistence/read-ports.ts";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runQuery, toPage, toPageQuery } from "../shared/read-pipeline.ts";

/** UC-PAYMENT-003. */

/**
 * The remaining reversible amount is computed here, not left as
 * `amount − reversedAmount` for the client. A client that gets that subtraction
 * wrong offers to reverse money that is not there, and the server refuses with
 * `PAYMENT_REVERSAL_EXCEEDS_REMAINING_AMOUNT` after the user has already typed it
 * (BR-PAYMENT-003).
 */
function toSummaryDto(row: PaymentSummaryRow): PaymentSummaryDto {
  const remaining = subtractMoney(row.amount, row.reversedAmount);
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    customerId: row.customerId,
    customerDisplayName: row.customerDisplayName,
    amount: row.amount,
    method: row.method,
    cashAccountId: row.cashAccountId,
    status: row.status,
    reversedAmount: row.reversedAmount,
    remainingReversibleAmount: remaining,
    payerName: row.payerName,
    note: row.note,
    version: row.version,
    transactionTime: row.transactionTime,
    recordedAt: row.recordedAt,
    // The same function the reverse command's guard uses (ADR-0003).
    capabilities: paymentSummaryCapabilities({ paymentId: row.id, status: row.status }),
  };
}

export async function getPayment(
  ctx: CommandContext,
  input: GetPaymentInput,
): Promise<DomainResult<PaymentSummaryDto>> {
  const result = await runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "payment.read",
    execute: async ({ repos }) => {
      const row = await repos.paymentReads.get(input.workspaceId, input.paymentId);
      return row === null ? null : toSummaryDto(row);
    },
  });

  if (!result.ok) {
    return result;
  }
  if (result.value === null) {
    return err("PAYMENT_NOT_FOUND", "No such payment in this workspace.", {
      paymentId: input.paymentId,
    });
  }
  return { ok: true, value: result.value };
}

export function listPayments(
  ctx: CommandContext,
  input: ListPaymentsInput,
): Promise<DomainResult<Page<PaymentSummaryDto>>> {
  return runQuery({
    ctx,
    workspaceId: input.workspaceId,
    permission: "payment.read",
    execute: async ({ repos }) => {
      const result = await repos.paymentReads.list({
        workspaceId: input.workspaceId,
        customerId: input.customerId,
        status: input.status,
        from: input.from,
        to: input.to,
        page: toPageQuery(input),
      });
      return toPage(result, toSummaryDto);
    },
  });
}
