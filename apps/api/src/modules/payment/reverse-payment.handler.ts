import type { PaymentDto, ReverseCustomerPaymentCommand } from "@vuarau/domain-contracts";
import { paymentDtoSchema, reverseCustomerPaymentCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  calculateActivePaymentAllocationAmount,
  decideReversePayment,
  err,
  negateMoney,
  ok,
  subtractExactIntegers,
  sumExactIntegers,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { CommandIntegrityError } from "../shared/integrity.ts";
import { applyAccountEffects } from "../shared/account-effects.ts";
import { applyCashMovements } from "../cash/cash-effects.ts";
import { toPaymentDto } from "../shared/mappers.ts";
import { currentRequestId } from "../../infrastructure/logging.ts";
import { activeCustomerCreditAmount } from "../account/customer-credit.ts";

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
    businessDayPolicy: "enforce",
    resultSchema: paymentDtoSchema,
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const payment = await repos.payments.findByIdForUpdate(
        command.workspaceId,
        command.payload.paymentId,
      );
      if (payment === null) {
        return err("PAYMENT_NOT_FOUND", "No such payment in this workspace.", {
          paymentId: command.payload.paymentId,
        });
      }

      const customer = await repos.customers.findByIdForUpdate(
        command.workspaceId,
        payment.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: payment.customerId,
        });
      }

      const linkedCashAccountId = payment.cashAccountId ?? null;
      if (
        linkedCashAccountId !== null &&
        (command.payload.cashAccountId ?? null) !== null &&
        (command.payload.cashAccountId ?? null) !== linkedCashAccountId
      ) {
        return err(
          "CASH_ACCOUNT_LINK_MISMATCH",
          "A linked payment reversal must use its original cash account.",
        );
      }
      const selectedCashAccountId = linkedCashAccountId ?? command.payload.cashAccountId ?? null;
      if (selectedCashAccountId === null && operationalProfile.cashbookMode === "accounts_ledger") {
        return err(
          "CASH_ACCOUNT_REQUIRED",
          "Select the account from which this legacy payment is being returned.",
        );
      }
      if (
        selectedCashAccountId !== null &&
        linkedCashAccountId === null &&
        operationalProfile.cashbookMode !== "accounts_ledger"
      ) {
        return err("WORKSPACE_WORKFLOW_DISABLED", "Cashbook is disabled for this depot.", {
          workflow: "cashbook",
        });
      }
      const cashAccount =
        selectedCashAccountId === null
          ? null
          : await repos.cashAccounts.findByIdForUpdate(command.workspaceId, selectedCashAccountId);
      if (selectedCashAccountId !== null && cashAccount === null) {
        return err("CASH_ACCOUNT_NOT_FOUND", "No such cash account.");
      }
      if (cashAccount !== null && linkedCashAccountId === null && !cashAccount.isActive) {
        return err("CASH_ACCOUNT_INACTIVE", "Cash account is inactive.");
      }
      if (cashAccount !== null && cashAccount.currency !== payment.amount.currency) {
        return err(
          "CASH_ACCOUNT_CURRENCY_MISMATCH",
          "Reversal currency must match the cash account.",
        );
      }
      const originalCashMovement =
        linkedCashAccountId === null
          ? null
          : await repos.cashMovements.findBySource(
              command.workspaceId,
              "customer_payment",
              payment.id,
              linkedCashAccountId,
            );
      if (linkedCashAccountId !== null && originalCashMovement === null) {
        throw new CommandIntegrityError(
          "CASH_RECONCILIATION_INTEGRITY_FAILURE",
          `Payment ${payment.id} is missing its linked cash movement.`,
        );
      }

      const originalEntry = await repos.accountEntries.findBySource(
        command.workspaceId,
        "payment",
        payment.id,
      );
      if (originalEntry === null) {
        throw new CommandIntegrityError(
          "ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
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
      const allocations = await repos.paymentAllocations.listByCustomer(
        command.workspaceId,
        payment.customerId,
      );
      const activeAllocationAmounts = allocations.allocations
        .filter((allocation) => allocation.paymentId === payment.id)
        .map((allocation) =>
          calculateActivePaymentAllocationAmount(allocation, allocations.reversals),
        );
      const activeAllocatedAmount = activeAllocationAmounts.some((amount) => amount === null)
        ? null
        : sumExactIntegers(activeAllocationAmounts as number[]);
      const effectivePaymentAfterReversal = subtractExactIntegers(
        payment.amount.amountMinor,
        updatedPayment.reversedAmount.amountMinor,
      );
      if (activeAllocatedAmount === null || effectivePaymentAfterReversal === null) {
        return err(
          "PERSISTED_NUMBER_OUT_OF_RANGE",
          "Persisted monetary data is outside the supported exact range.",
          { field: "payment.active_allocation.amount_minor", requestId: currentRequestId() },
        );
      }
      if (activeAllocatedAmount > effectivePaymentAfterReversal) {
        return err(
          "PAYMENT_REVERSAL_WOULD_EXCEED_ALLOCATIONS",
          "Reverse the active payment allocations before reversing this payment amount.",
          {
            activeAllocatedAmount,
            effectivePaymentAfterReversal,
            paymentId: payment.id,
          },
        );
      }
      const preservedCreditAmount = activeCustomerCreditAmount(
        await repos.debtObservations.listByPayment(command.workspaceId, payment.id),
      );
      if (preservedCreditAmount === null) {
        return err(
          "PERSISTED_NUMBER_OUT_OF_RANGE",
          "Persisted monetary data is outside the supported exact range.",
          {
            field: "payment.customer_credit_preserved.amount_minor",
            requestId: currentRequestId(),
          },
        );
      }
      if (preservedCreditAmount > effectivePaymentAfterReversal) {
        return err(
          "PAYMENT_REVERSAL_WOULD_EXCEED_CUSTOMER_CREDIT",
          "Correct the preserved customer-credit fact before reversing this payment amount.",
          {
            preservedCreditAmount,
            effectivePaymentAfterReversal,
            paymentId: payment.id,
          },
        );
      }

      const updated = await repos.payments.update(updatedPayment, payment.version);
      if (!updated) {
        return err("PAYMENT_VERSION_CONFLICT", "Payment was modified by someone else.", {
          paymentId: payment.id,
          expectedVersion: command.expectedVersion,
          actualVersion: payment.version,
        });
      }

      await repos.payments.insertReversal(reversal);
      await applyAccountEffects(repos, decision.value.accountEntries, payment.amount.currency);
      if (cashAccount !== null) {
        await applyCashMovements(repos, [
          {
            workspaceId: command.workspaceId,
            cashAccountId: cashAccount.id,
            amount: {
              ...negateMoney(command.payload.amount),
            },
            sourceType: "customer_payment_reversal",
            sourceId: command.payload.reversalId,
            reversalOfMovementId: originalCashMovement?.id ?? null,
            note: command.payload.reason.trim(),
            transactionTime: command.occurredAt,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ]);
      }
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
