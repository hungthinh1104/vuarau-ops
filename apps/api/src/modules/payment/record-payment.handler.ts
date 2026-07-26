import type { PaymentDto, RecordCustomerPaymentCommand } from "@vuarau/domain-contracts";
import { recordCustomerPaymentCommandSchema } from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import { decideRecordPayment, err, ok } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applyLedgerEffects } from "../shared/debt-effects.ts";
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
    execute: async ({ command, repos, recordedAt }) => {
      const customer = await repos.customers.findById(
        command.workspaceId,
        command.payload.customerId,
      );
      if (customer === null) {
        return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
          customerId: command.payload.customerId,
        });
      }

      const decision = decideRecordPayment({ command, recordedAt });
      if (!decision.ok) {
        return decision;
      }

      const payment = decision.value.aggregate;
      await repos.payments.insert(payment);
      await applyLedgerEffects(repos, decision.value.ledgerEntries, payment.amount.currency);
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
