import type {
  PaymentAllocationDto,
  PaymentAllocationReversalDto,
  RecordPaymentAllocationCommand,
  ReversePaymentAllocationCommand,
} from "@vuarau/domain-contracts";
import {
  paymentAllocationPolicyDefinitionSchema,
  recordPaymentAllocationCommandSchema,
  reversePaymentAllocationCommandSchema,
} from "@vuarau/domain-contracts";
import type { DomainResult } from "@vuarau/domain-kernel";
import {
  decideRecordPaymentAllocation,
  decideReversePaymentAllocation,
  err,
  ok,
  resolveEffectiveWorkspacePolicy,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import type { Repositories } from "../../infrastructure/persistence/ports.ts";
import { runCommand } from "../shared/command-pipeline.ts";

async function requireManualAllocationPolicy(
  workspaceId: RecordPaymentAllocationCommand["workspaceId"],
  asOf: RecordPaymentAllocationCommand["occurredAt"],
  repos: Repositories,
): Promise<DomainResult<null>> {
  const policy = resolveEffectiveWorkspacePolicy(
    await repos.workspacePolicyReads.listAll(workspaceId),
    "payment_allocation",
    asOf,
  );
  if (policy === null) {
    return err(
      "PAYMENT_ALLOCATION_POLICY_NOT_MANUAL",
      "No approved payment allocation policy is effective for this allocation.",
    );
  }
  const definition = paymentAllocationPolicyDefinitionSchema.safeParse(policy.definition);
  if (
    !definition.success ||
    (definition.data.parameters.strategy !== "manual" &&
      definition.data.parameters.strategy !== "specific_sale")
  ) {
    return err(
      "PAYMENT_ALLOCATION_POLICY_NOT_MANUAL",
      "Explicit allocation requires a manual or specific-sale allocation policy.",
    );
  }
  return ok(null);
}

export function recordPaymentAllocation(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PaymentAllocationDto>> {
  return runCommand<RecordPaymentAllocationCommand, PaymentAllocationDto>({
    commandType: "RecordPaymentAllocation",
    schema: recordPaymentAllocationCommandSchema,
    input,
    ctx,
    requiredPermission: "debt.allocate",
    execute: async ({ command, repos, recordedAt }) => {
      const policy = await requireManualAllocationPolicy(
        command.workspaceId,
        command.occurredAt,
        repos,
      );
      if (!policy.ok) return policy;

      const payment = await repos.payments.findByIdForUpdate(
        command.workspaceId,
        command.payload.paymentId,
      );
      if (payment === null) {
        return err("PAYMENT_NOT_FOUND", "No such payment in this workspace.", {
          paymentId: command.payload.paymentId,
        });
      }
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, command.payload.saleId);
      if (sale === null) {
        return err("SALE_NOT_FOUND", "No such sale in this workspace.", {
          saleId: command.payload.saleId,
        });
      }
      const existing = await repos.paymentAllocations.listByCustomer(
        command.workspaceId,
        payment.customerId,
      );
      const decision = decideRecordPaymentAllocation(
        command,
        { payment, sale, allocation: null, ...existing },
        recordedAt,
      );
      if (!decision.ok) return decision;
      const inserted = await repos.paymentAllocations.insert(decision.value.value);
      if (!inserted) {
        return err("PAYMENT_ALLOCATION_ALREADY_EXISTS", "This allocation id is already recorded.", {
          allocationId: command.payload.allocationId,
        });
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.value);
    },
  });
}

export function reversePaymentAllocation(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<PaymentAllocationReversalDto>> {
  return runCommand<ReversePaymentAllocationCommand, PaymentAllocationReversalDto>({
    commandType: "ReversePaymentAllocation",
    schema: reversePaymentAllocationCommandSchema,
    input,
    ctx,
    requiredPermission: "debt.allocate",
    execute: async ({ command, repos, recordedAt }) => {
      const allocation = await repos.paymentAllocations.findByIdForUpdate(
        command.workspaceId,
        command.payload.allocationId,
      );
      if (allocation === null) {
        return err("PAYMENT_ALLOCATION_NOT_FOUND", "No such payment allocation in this workspace.");
      }
      const payment = await repos.payments.findByIdForUpdate(
        command.workspaceId,
        allocation.paymentId,
      );
      if (payment === null) {
        throw new Error(`Payment allocation ${allocation.id} references a missing payment.`);
      }
      const sale = await repos.sales.findByIdForUpdate(command.workspaceId, allocation.saleId);
      if (sale === null) {
        throw new Error(`Payment allocation ${allocation.id} references a missing sale.`);
      }
      const existing = await repos.paymentAllocations.listByCustomer(
        command.workspaceId,
        allocation.customerId,
      );
      const decision = decideReversePaymentAllocation(
        command,
        { payment, sale, allocation, ...existing },
        recordedAt,
      );
      if (!decision.ok) return decision;
      const inserted = await repos.paymentAllocations.insertReversal(decision.value.value);
      if (!inserted) {
        return err(
          "PAYMENT_ALLOCATION_REVERSAL_ALREADY_EXISTS",
          "This allocation reversal id is already recorded.",
          { reversalId: command.payload.reversalId },
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.value);
    },
  });
}
