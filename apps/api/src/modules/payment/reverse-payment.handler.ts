import type { PaymentDto, ReverseCustomerPaymentCommand } from "@vuarau/domain-contracts";
import { reverseCustomerPaymentCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideReversePayment, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyLedgerEffects } from "../shared/debt-effects.ts";
import { toPaymentDto } from "../shared/mappers.ts";

/**
 * UC-PAYMENT-002. Undoes a payment's financial effect while preserving the fact
 * that it happened: a reversal record plus a compensating ledger entry, never a
 * second payment (BR-PAYMENT-005).
 */
export function reverseCustomerPayment(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PaymentDto>> {
  return runCommand<ReverseCustomerPaymentCommand, PaymentDto>({
    commandType: "ReverseCustomerPayment",
    schema: reverseCustomerPaymentCommandSchema,
    input,
    ctx,
    requiredPermission: "payment.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const payment = await repos.payments.findByIdForUpdate(
        command.workspaceId,
        command.payload.paymentId,
      );
      if (payment === null) {
        return err("PAYMENT_NOT_FOUND", "No such payment in this workspace.", {
          paymentId: command.payload.paymentId,
        });
      }

      const originalEntry = await repos.ledger.findBySource(
        command.workspaceId,
        "payment",
        payment.id,
      );
      if (originalEntry === null) {
        // Not a business refusal: a payment without its ledger entry means the
        // invariant that creates them together has already been violated. Failing
        // loudly is the only safe response — see BR-COMMAND-005.
        throw new Error(
          `Payment ${payment.id} has no ledger entry. The ledger and the payment ` +
            "table have diverged; refusing to compensate an entry that does not exist.",
        );
      }

      const decision = decideReversePayment({
        command,
        payment,
        originalLedgerEntryId: originalEntry.id,
        recordedAt,
      });
      if (!decision.ok) {
        return decision;
      }

      const { payment: updatedPayment, reversal } = decision.value.aggregate;

      const updated = await repos.payments.update(updatedPayment, payment.version);
      if (!updated) {
        return err("PAYMENT_VERSION_CONFLICT", "Payment was modified by someone else.", {
          paymentId: payment.id,
          expectedVersion: command.expectedVersion,
          actualVersion: payment.version,
        });
      }

      await repos.payments.insertReversal(reversal);
      await applyLedgerEffects(repos, decision.value.ledgerEntries, payment.amount.currency);
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });

      return ok(toPaymentDto(updatedPayment));
    },
  });
}
