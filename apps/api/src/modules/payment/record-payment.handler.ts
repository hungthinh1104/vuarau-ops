import type { PaymentDto, RecordCustomerPaymentCommand } from "@vuarau/domain-contracts";
import { recordCustomerPaymentCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideRecordPayment, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyAccountEffects } from "../shared/account-effects.ts";
import { applyCashMovements } from "../cash/cash-effects.ts";
import { toPaymentDto } from "../shared/mappers.ts";

/** UC-PAYMENT-001. Money received, recorded exactly once however often it is sent. */
export function recordCustomerPayment(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PaymentDto>> {
  return runCommand<RecordCustomerPaymentCommand, PaymentDto>({
    commandType: "RecordCustomerPayment",
    schema: recordCustomerPaymentCommandSchema,
    input,
    ctx,
    requiredPermission: "payment.record",
    execute: async ({ command, repos, recordedAt, operationalProfile }) => {
      const customer = await repos.customers.findById(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const cashbookEnabled = operationalProfile.cashbookMode === "accounts_ledger";
      if (!cashbookEnabled && (command.payload.cashAccountId ?? null) !== null) {
        return err("WORKSPACE_WORKFLOW_DISABLED", "Cashbook is disabled for this depot.", {
          workflow: "cashbook",
        });
      }
      const cashAccount =
        (command.payload.cashAccountId ?? null) === null
          ? null
          : await repos.cashAccounts.findByIdForUpdate(
              command.workspaceId,
              (command.payload.cashAccountId ?? null)!,
            );
      if (cashbookEnabled && cashAccount === null) {
        return err("CASH_ACCOUNT_REQUIRED", "Select the account that received this payment.");
      }
      if (cashAccount !== null && !cashAccount.isActive) {
        return err("CASH_ACCOUNT_INACTIVE", "Cash account is inactive.");
      }
      if (cashAccount !== null && cashAccount.currency !== command.payload.amount.currency) {
        return err(
          "CASH_ACCOUNT_CURRENCY_MISMATCH",
          "Payment currency must match the cash account.",
        );
      }

      const decision = decideRecordPayment({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const payment = decision.value.aggregate;
      await repos.payments.insert(payment);
      await applyAccountEffects(repos, decision.value.accountEntries, payment.amount.currency);
      if (cashAccount !== null) {
        await applyCashMovements(repos, [
          {
            workspaceId: command.workspaceId,
            cashAccountId: cashAccount.id,
            amount: payment.amount,
            sourceType: "customer_payment",
            sourceId: payment.id,
            reversalOfMovementId: null,
            note: payment.note,
            transactionTime: payment.transactionTime,
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

      return ok(toPaymentDto(payment));
    },
  });
}
