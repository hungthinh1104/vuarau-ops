import type {
  CostObservationDto,
  RecordCostObservationCommand,
  ReconciliationObservationDto,
  RecordReconciliationObservationCommand,
  DebtObservationDto,
  RecordDebtObservationCommand,
  SupplyCommitmentObservationDto,
  RecordSupplyCommitmentObservationCommand,
  SupplierObservationDto,
  RecordSupplierObservationCommand,
  DemandObservationDto,
  RecordDemandObservationCommand,
} from "@vuarau/domain-contracts";
import {
  costObservationDtoSchema,
  debtObservationDtoSchema,
  demandObservationDtoSchema,
  reconciliationObservationDtoSchema,
  recordCostObservationCommandSchema,
  recordDebtObservationCommandSchema,
  recordDemandObservationCommandSchema,
  recordReconciliationObservationCommandSchema,
  recordSupplyCommitmentObservationCommandSchema,
  recordSupplierObservationCommandSchema,
  supplyCommitmentObservationDtoSchema,
  supplierObservationDtoSchema,
  paymentIdSchema,
} from "@vuarau/domain-contracts";
import {
  decideRecordCostObservation,
  decideRecordReconciliationObservation,
  decideRecordDebtObservation,
  decideRecordSupplyCommitmentObservation,
  decideRecordSupplierObservation,
  decideRecordDemandObservation,
  calculateActivePaymentAllocationAmount,
  subtractExactIntegers,
  sumExactIntegers,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { activeCustomerCreditAmount } from "../account/customer-credit.ts";

export function recordCostObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordCostObservationCommand, CostObservationDto>({
    commandType: "RecordCostObservation",
    schema: recordCostObservationCommandSchema,
    resultSchema: costObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.costObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.costObservations.findCorrectionByTarget(command.workspaceId, target.id);
      const decision = decideRecordCostObservation(command, recordedAt, target, successor !== null);
      if (!decision.ok) return decision;
      if (!(await repos.costObservations.insert(decision.value.observation))) {
        return err(
          "COST_OBSERVATION_ALREADY_RECORDED",
          "Cost observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordReconciliationObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordReconciliationObservationCommand, ReconciliationObservationDto>({
    commandType: "RecordReconciliationObservation",
    schema: recordReconciliationObservationCommandSchema,
    resultSchema: reconciliationObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.reconciliationObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.reconciliationObservations.findCorrectionByTarget(
              command.workspaceId,
              target.id,
            );
      const decision = decideRecordReconciliationObservation(
        command,
        recordedAt,
        target,
        successor !== null,
      );
      if (!decision.ok) return decision;
      if (!(await repos.reconciliationObservations.insert(decision.value.observation))) {
        return err(
          "RECONCILIATION_OBSERVATION_ALREADY_RECORDED",
          "Reconciliation observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordDebtObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordDebtObservationCommand, DebtObservationDto>({
    commandType: "RecordDebtObservation",
    schema: recordDebtObservationCommandSchema,
    resultSchema: debtObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      if (command.payload.kind === "customer_credit_preserved") {
        const paymentId = paymentIdSchema.safeParse(command.payload.facts.paymentReference);
        if (!paymentId.success) {
          return err(
            "CUSTOMER_CREDIT_PRESERVATION_PAYMENT_INVALID",
            "Customer-credit preservation must reference a valid payment.",
          );
        }
        const payment = await repos.payments.findByIdForUpdate(command.workspaceId, paymentId.data);
        if (payment === null) {
          return err(
            "CUSTOMER_CREDIT_PRESERVATION_PAYMENT_INVALID",
            "Customer-credit preservation must reference a payment in this workspace.",
          );
        }
        if (payment.customerId !== command.payload.facts.customerId) {
          return err(
            "CUSTOMER_CREDIT_PRESERVATION_CUSTOMER_MISMATCH",
            "Customer-credit preservation must use the payment customer.",
          );
        }
        if (payment.amount.currency !== command.payload.facts.amount?.currency) {
          return err(
            "PAYMENT_CURRENCY_MISMATCH",
            "Customer-credit preservation currency must match the payment.",
          );
        }

        const existingCreditFacts = await repos.debtObservations.listByPayment(
          command.workspaceId,
          payment.id,
        );
        const activeCredit = activeCustomerCreditAmount(
          existingCreditFacts,
          command.payload.relatedObservationId,
        );
        const allocations = await repos.paymentAllocations.listByCustomer(
          command.workspaceId,
          payment.customerId,
        );
        const activeAllocated = sumExactIntegers(
          allocations.allocations
            .filter((allocation) => allocation.paymentId === payment.id)
            .map((allocation) =>
              calculateActivePaymentAllocationAmount(allocation, allocations.reversals),
            )
            .filter((amount): amount is number => amount !== null),
        );
        const effectiveAmount = subtractExactIntegers(
          payment.amount.amountMinor,
          payment.reversedAmount.amountMinor,
        );
        const afterAllocation =
          effectiveAmount === null || activeAllocated === null
            ? null
            : subtractExactIntegers(effectiveAmount, activeAllocated);
        const available =
          afterAllocation === null || activeCredit === null
            ? null
            : subtractExactIntegers(afterAllocation, activeCredit);
        if (
          available === null ||
          command.payload.facts.amount === null ||
          command.payload.facts.amount.amountMinor > Math.max(0, available)
        ) {
          return err(
            "CUSTOMER_CREDIT_PRESERVATION_EXCEEDS_UNALLOCATED",
            "Customer-credit preservation exceeds the payment's unallocated amount.",
            { availableAmountMinor: Math.max(0, available ?? 0) },
          );
        }
      }
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.debtObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.debtObservations.findCorrectionByTarget(command.workspaceId, target.id);
      const decision = decideRecordDebtObservation(command, recordedAt, target, successor !== null);
      if (!decision.ok) return decision;
      if (!(await repos.debtObservations.insert(decision.value.observation))) {
        return err(
          "DEBT_OBSERVATION_ALREADY_RECORDED",
          "Debt observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordSupplyCommitmentObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordSupplyCommitmentObservationCommand, SupplyCommitmentObservationDto>({
    commandType: "RecordSupplyCommitmentObservation",
    schema: recordSupplyCommitmentObservationCommandSchema,
    resultSchema: supplyCommitmentObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.supplyCommitmentObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.supplyCommitmentObservations.findCorrectionByTarget(
              command.workspaceId,
              target.id,
            );
      const decision = decideRecordSupplyCommitmentObservation(
        command,
        recordedAt,
        target,
        successor !== null,
      );
      if (!decision.ok) return decision;
      if (!(await repos.supplyCommitmentObservations.insert(decision.value.observation))) {
        return err(
          "SUPPLY_COMMITMENT_OBSERVATION_ALREADY_RECORDED",
          "Supply commitment observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordSupplierObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordSupplierObservationCommand, SupplierObservationDto>({
    commandType: "RecordSupplierObservation",
    schema: recordSupplierObservationCommandSchema,
    resultSchema: supplierObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.supplierObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.supplierObservations.findCorrectionByTarget(command.workspaceId, target.id);
      const decision = decideRecordSupplierObservation(
        command,
        recordedAt,
        target,
        successor !== null,
      );
      if (!decision.ok) return decision;
      if (!(await repos.supplierObservations.insert(decision.value.observation))) {
        return err(
          "SUPPLIER_OBSERVATION_ALREADY_RECORDED",
          "Supplier observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}

export function recordDemandObservation(ctx: CommandContext, input: unknown) {
  return runCommand<RecordDemandObservationCommand, DemandObservationDto>({
    commandType: "RecordDemandObservation",
    schema: recordDemandObservationCommandSchema,
    resultSchema: demandObservationDtoSchema,
    input,
    ctx,
    requiredPermission: "evidence.record",
    businessDayPolicy: "enforce",
    execute: async ({ command, repos, recordedAt }) => {
      const target =
        command.payload.relatedObservationId === null
          ? null
          : await repos.demandObservations.findByIdForUpdate(
              command.workspaceId,
              command.payload.relatedObservationId,
            );
      const successor =
        target === null
          ? null
          : await repos.demandObservations.findCorrectionByTarget(command.workspaceId, target.id);
      const decision = decideRecordDemandObservation(
        command,
        recordedAt,
        target,
        successor !== null,
      );
      if (!decision.ok) return decision;
      if (!(await repos.demandObservations.insert(decision.value.observation))) {
        return err(
          "DEMAND_OBSERVATION_ALREADY_RECORDED",
          "Demand observation identity already exists.",
        );
      }
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(decision.value.observation);
    },
  });
}
