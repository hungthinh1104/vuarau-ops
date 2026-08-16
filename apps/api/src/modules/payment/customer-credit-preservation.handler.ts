import type {
  CustomerPaymentCreditPreservationDto,
  PreserveCustomerPaymentAsCreditCommand,
} from "@vuarau/domain-contracts";
import {
  customerPaymentCreditPreservationDtoSchema,
  preserveCustomerPaymentAsCreditCommandSchema,
} from "@vuarau/domain-contracts";
import {
  activeCustomerPaymentCreditAmount,
  calculateActivePaymentAllocationAmount,
  decidePreserveCustomerPaymentAsCredit,
  derivePaymentExposure,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

/**
 * Financial control boundary for retaining an unallocated Payment as customer
 * credit. The payment row is locked before all related facts are read, so an
 * allocation, reversal or another preservation cannot race the available amount.
 */
export function preserveCustomerPaymentAsCredit(ctx: CommandContext, input: unknown) {
  return runCommand<PreserveCustomerPaymentAsCreditCommand, CustomerPaymentCreditPreservationDto>({
    commandType: "PreserveCustomerPaymentAsCredit",
    schema: preserveCustomerPaymentAsCreditCommandSchema,
    resultSchema: customerPaymentCreditPreservationDtoSchema,
    input,
    ctx,
    requiredPermission: "debt.allocate",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const payment = await repos.payments.findByIdForUpdate(
        command.workspaceId,
        command.payload.paymentId,
      );
      if (payment === null) {
        return err(
          "CUSTOMER_CREDIT_PRESERVATION_PAYMENT_INVALID",
          "Customer-credit preservation must reference a payment in this workspace.",
          { paymentId: command.payload.paymentId },
        );
      }
      const correctionTarget =
        command.payload.relatedPreservationId === null
          ? null
          : await repos.customerPaymentCreditPreservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedPreservationId,
            );
      const successor =
        correctionTarget === null
          ? null
          : await repos.customerPaymentCreditPreservations.findCorrectionByTarget(
              command.workspaceId,
              correctionTarget.id,
            );
      const preservations = await repos.customerPaymentCreditPreservations.listByPayment(
        command.workspaceId,
        payment.id,
      );
      const activePreservedCredit = activeCustomerPaymentCreditAmount(
        preservations,
        command.payload.relatedPreservationId,
      );
      const allocations = await repos.paymentAllocations.listByCustomer(
        command.workspaceId,
        payment.customerId,
      );
      const paymentAllocations = allocations.allocations
        .filter((allocation) => allocation.paymentId === payment.id)
        .map((allocation) => ({
          allocation,
          activeAmountMinor: calculateActivePaymentAllocationAmount(
            allocation,
            allocations.reversals,
          ),
        }));
      if (
        activePreservedCredit === null ||
        paymentAllocations.some(({ activeAmountMinor }) => activeAmountMinor === null)
      ) {
        return err(
          "PERSISTED_NUMBER_OUT_OF_RANGE",
          "Cannot derive payment availability from invalid persisted allocation or credit data.",
          { paymentId: payment.id },
        );
      }
      const exposure = derivePaymentExposure({
        originalAmountMinor: payment.amount.amountMinor,
        reversedAmountMinor: payment.reversedAmount.amountMinor,
        allocations: paymentAllocations.map(({ allocation, activeAmountMinor }) => ({
          amountMinor: allocation.amount.amountMinor,
          // The null case was refused immediately above; keeping the exact
          // integer lets the shared kernel remain the sole arithmetic owner.
          reversedAmountMinor: allocation.amount.amountMinor - activeAmountMinor!,
        })),
        preservedCreditAmountMinor: activePreservedCredit,
      });
      if (exposure === null) {
        return err(
          "PERSISTED_NUMBER_OUT_OF_RANGE",
          "Cannot derive payment availability from invalid persisted payment data.",
          { paymentId: payment.id },
        );
      }
      const decision = decidePreserveCustomerPaymentAsCredit(
        command,
        {
          payment,
          correctionTarget,
          correctionTargetAlreadyCorrected: successor !== null,
          availableAmountMinor: exposure.availableAmountMinor,
        },
        recordedAt,
      );
      if (!decision.ok) return decision;
      if (!(await repos.customerPaymentCreditPreservations.insert(decision.value.preservation))) {
        return err(
          "CUSTOMER_CREDIT_PRESERVATION_ALREADY_RECORDED",
          "Customer-credit preservation identity already exists.",
          { preservationId: command.payload.preservationId },
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.preservation);
    },
  });
}
