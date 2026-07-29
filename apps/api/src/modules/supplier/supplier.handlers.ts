import type {
  AdjustSupplierAccountCommand,
  AuditAction,
  CreateSupplierCommand,
  DeactivateSupplierCommand,
  ReactivateSupplierCommand,
  RecordSupplierPaymentCommand,
  ReverseSupplierPaymentCommand,
  SupplierDto,
  SupplierPaymentDto,
  UpdateSupplierCommand,
} from "@vuarau/domain-contracts";
import {
  adjustSupplierAccountCommandSchema,
  createSupplierCommandSchema,
  deactivateSupplierCommandSchema,
  reactivateSupplierCommandSchema,
  recordSupplierPaymentCommandSchema,
  reverseSupplierPaymentCommandSchema,
  updateSupplierCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideCreateSupplier,
  decideRecordSupplierPayment,
  decideReverseSupplierPayment,
  decideSupplierLifecycle,
  decideUpdateSupplier,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { DomainResult, SupplierPaymentState, SupplierState } from "@vuarau/domain-kernel";
import type { z } from "zod";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";
import { applySupplierAccountEffects } from "./supplier-account-effects.ts";

const supplierDto = (state: SupplierState): SupplierDto => ({ ...state });
const paymentDto = (state: SupplierPaymentState): SupplierPaymentDto => ({
  ...state,
  status:
    state.reversedAmount.amountMinor === 0
      ? "recorded"
      : state.reversedAmount.amountMinor === state.amount.amountMinor
        ? "reversed"
        : "partially_reversed",
});

export function createSupplier(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<SupplierDto>> {
  return runCommand<CreateSupplierCommand, SupplierDto>({
    commandType: "CreateSupplier",
    schema: createSupplierCommandSchema,
    input,
    ctx,
    requiredPermission: "supplier.create",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.suppliers.findById(command.workspaceId, command.payload.supplierId)) !== null
      )
        return err("SUPPLIER_VERSION_CONFLICT", "Supplier identity already exists.");
      const decision = decideCreateSupplier(command, recordedAt);
      if (!decision.ok) return decision;
      await repos.suppliers.insert(decision.value);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier",
        aggregateId: decision.value.id,
        action: "supplier.created",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { isActive: true, version: 1 },
        reason: null,
      });
      return ok(supplierDto(decision.value));
    },
  });
}

function mutateSupplier<
  T extends UpdateSupplierCommand | DeactivateSupplierCommand | ReactivateSupplierCommand,
>(args: {
  ctx: CommandContext;
  input: unknown;
  type: string;
  schema: z.ZodType<T>;
  permission: "supplier.update" | "supplier.deactivate" | "supplier.reactivate";
  action: AuditAction;
  decide: (
    current: SupplierState,
    command: T,
    at: SupplierState["updatedAt"],
  ) => DomainResult<SupplierState>;
}) {
  return runCommand<T, SupplierDto>({
    commandType: args.type,
    schema: args.schema,
    input: args.input,
    ctx: args.ctx,
    requiredPermission: args.permission,
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.suppliers.findByIdForUpdate(
        command.workspaceId,
        command.payload.supplierId,
      );
      if (current === null) return err("SUPPLIER_NOT_FOUND", "No such supplier.");
      const decision = args.decide(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.suppliers.update(decision.value, current.version)))
        return err("SUPPLIER_VERSION_CONFLICT", "Supplier changed on the server.");
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier",
        aggregateId: current.id,
        action: args.action,
        transactionTime: command.occurredAt,
        recordedAt,
        before: { isActive: current.isActive, version: current.version },
        after: { isActive: decision.value.isActive, version: decision.value.version },
        reason: "reason" in command.payload ? command.payload.reason : null,
      });
      return ok(supplierDto(decision.value));
    },
  });
}

export const updateSupplier = (ctx: CommandContext, input: unknown) =>
  mutateSupplier({
    ctx,
    input,
    type: "UpdateSupplier",
    schema: updateSupplierCommandSchema,
    permission: "supplier.update",
    action: "supplier.updated",
    decide: decideUpdateSupplier,
  });
export const deactivateSupplier = (ctx: CommandContext, input: unknown) =>
  mutateSupplier({
    ctx,
    input,
    type: "DeactivateSupplier",
    schema: deactivateSupplierCommandSchema,
    permission: "supplier.deactivate",
    action: "supplier.deactivated",
    decide: (current, command, at) => decideSupplierLifecycle(current, command, false, at),
  });
export const reactivateSupplier = (ctx: CommandContext, input: unknown) =>
  mutateSupplier({
    ctx,
    input,
    type: "ReactivateSupplier",
    schema: reactivateSupplierCommandSchema,
    permission: "supplier.reactivate",
    action: "supplier.reactivated",
    decide: (current, command, at) => decideSupplierLifecycle(current, command, true, at),
  });

export function recordSupplierPayment(ctx: CommandContext, input: unknown) {
  return runCommand<RecordSupplierPaymentCommand, SupplierPaymentDto>({
    commandType: "RecordSupplierPayment",
    schema: recordSupplierPaymentCommandSchema,
    input,
    ctx,
    requiredPermission: "supplier.payment.record",
    execute: async ({ command, repos, recordedAt }) => {
      const supplier = await repos.suppliers.findById(
        command.workspaceId,
        command.payload.supplierId,
      );
      if (supplier === null) return err("SUPPLIER_NOT_FOUND", "No such supplier.");
      const decision = decideRecordSupplierPayment(command, recordedAt);
      if (!decision.ok) return decision;
      const payment = decision.value;
      await repos.supplierPayments.insert(payment);
      await applySupplierAccountEffects(
        repos,
        [
          {
            workspaceId: command.workspaceId,
            supplierId: payment.supplierId,
            amount: { amountMinor: -payment.amount.amountMinor, currency: payment.amount.currency },
            sourceType: "supplier_payment",
            sourceId: payment.id,
            reversalOfEntryId: null,
            reasonCode: null,
            reason: payment.note,
            transactionTime: payment.transactionTime,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ],
        payment.amount.currency,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier_payment",
        aggregateId: payment.id,
        action: "supplier_payment.recorded",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { version: 1 },
        reason: payment.note,
      });
      return ok(paymentDto(payment));
    },
  });
}

export function reverseSupplierPayment(ctx: CommandContext, input: unknown) {
  return runCommand<ReverseSupplierPaymentCommand, SupplierPaymentDto>({
    commandType: "ReverseSupplierPayment",
    schema: reverseSupplierPaymentCommandSchema,
    input,
    ctx,
    requiredPermission: "supplier.payment.reverse",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.supplierPayments.findByIdForUpdate(
        command.workspaceId,
        command.payload.supplierPaymentId,
      );
      if (current === null) return err("SUPPLIER_PAYMENT_NOT_FOUND", "No such payment.");
      const originalEntry = await repos.supplierAccountEntries.findBySource(
        command.workspaceId,
        "supplier_payment",
        current.id,
      );
      if (originalEntry === null)
        return err(
          "SUPPLIER_ACCOUNT_RECONCILIATION_INTEGRITY_FAILURE",
          "Supplier payment is missing its canonical account effect.",
        );
      const decision = decideReverseSupplierPayment(current, command);
      if (!decision.ok) return decision;
      if (!(await repos.supplierPayments.update(decision.value, current.version)))
        return err("SUPPLIER_VERSION_CONFLICT", "Supplier payment changed.");
      await repos.supplierPayments.insertReversal({
        id: command.payload.reversalId,
        workspaceId: command.workspaceId,
        supplierPaymentId: current.id,
        amount: command.payload.amount,
        reason: command.payload.reason.trim(),
        transactionTime: command.occurredAt,
        recordedAt,
      });
      await applySupplierAccountEffects(
        repos,
        [
          {
            workspaceId: command.workspaceId,
            supplierId: current.supplierId,
            amount: command.payload.amount,
            sourceType: "supplier_payment_reversal",
            sourceId: command.payload.reversalId,
            reversalOfEntryId: originalEntry.id,
            reasonCode: null,
            reason: command.payload.reason.trim(),
            transactionTime: command.occurredAt,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ],
        current.amount.currency,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier_payment",
        aggregateId: current.id,
        action: "supplier_payment.reversed",
        transactionTime: command.occurredAt,
        recordedAt,
        before: { version: current.version },
        after: { version: decision.value.version },
        reason: command.payload.reason.trim(),
      });
      return ok(paymentDto(decision.value));
    },
  });
}

export function adjustSupplierAccount(ctx: CommandContext, input: unknown) {
  return runCommand<AdjustSupplierAccountCommand, { adjustmentId: string }>({
    commandType: "AdjustSupplierAccount",
    schema: adjustSupplierAccountCommandSchema,
    input,
    ctx,
    requiredPermission: "supplier.account.adjust",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.suppliers.findById(command.workspaceId, command.payload.supplierId)) === null
      )
        return err("SUPPLIER_NOT_FOUND", "No such supplier.");
      if (command.payload.reason.trim().length === 0)
        return err("SUPPLIER_ACCOUNT_ADJUSTMENT_REASON_REQUIRED", "Reason is required.");
      if (command.payload.amount.amountMinor <= 0)
        return err("SUPPLIER_ACCOUNT_ADJUSTMENT_AMOUNT_INVALID", "Amount must be positive.");
      const signed =
        command.payload.direction === "increase_payable"
          ? command.payload.amount.amountMinor
          : -command.payload.amount.amountMinor;
      await applySupplierAccountEffects(
        repos,
        [
          {
            workspaceId: command.workspaceId,
            supplierId: command.payload.supplierId,
            amount: { amountMinor: signed, currency: command.payload.amount.currency },
            sourceType: "manual_adjustment",
            sourceId: command.payload.adjustmentId,
            reversalOfEntryId: null,
            reasonCode: command.payload.reasonCode,
            reason: command.payload.reason.trim(),
            transactionTime: command.occurredAt,
            recordedAt,
            actorId: command.actorId,
            commandId: command.commandId,
          },
        ],
        command.payload.amount.currency,
      );
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "supplier_account",
        aggregateId: command.payload.adjustmentId,
        action: "supplier_account.adjusted",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { direction: command.payload.direction },
        reason: command.payload.reason.trim(),
      });
      return ok({ adjustmentId: command.payload.adjustmentId });
    },
  });
}
