import type {
  CancelSupplyCommitmentCommand,
  ConfirmSupplyCommitmentCommand,
  CreateSupplyCommitmentDraftCommand,
  SupplyCommitmentDto,
  UpdateSupplyCommitmentDraftCommand,
} from "@vuarau/domain-contracts";
import {
  cancelSupplyCommitmentCommandSchema,
  confirmSupplyCommitmentCommandSchema,
  createSupplyCommitmentDraftCommandSchema,
  supplyCommitmentDtoSchema,
  updateSupplyCommitmentDraftCommandSchema,
} from "@vuarau/domain-contracts";
import type { SupplyCommitmentState } from "@vuarau/domain-kernel";
import {
  decideCancelSupplyCommitment,
  decideConfirmSupplyCommitment,
  decideCreateSupplyCommitmentDraft,
  decideUpdateSupplyCommitmentDraft,
  err,
  ok,
  supplyCommitmentCapabilities,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export function toSupplyCommitmentDto(commitment: SupplyCommitmentState): SupplyCommitmentDto {
  return {
    ...commitment,
    lines: commitment.lines.map((line) => ({ ...line, quantity: { ...line.quantity } })),
    paymentTermsSnapshot:
      commitment.paymentTermsSnapshot === null ? null : { ...commitment.paymentTermsSnapshot },
    evidenceReferences: [...commitment.evidenceReferences],
    capabilities: supplyCommitmentCapabilities(commitment),
  };
}

async function validateReferences(
  repos: Parameters<Parameters<typeof runCommand>[0]["execute"]>[0]["repos"],
  commitment: SupplyCommitmentState,
  requireActiveSupplier: boolean,
) {
  const supplier = await repos.suppliers.findById(commitment.workspaceId, commitment.supplierId);
  if (supplier === null) return err("SUPPLIER_NOT_FOUND", "No such supplier in this workspace.");
  if (requireActiveSupplier && !supplier.isActive)
    return err("SUPPLIER_INACTIVE", "Inactive supplier cannot confirm a new commitment.");
  for (const line of commitment.lines) {
    if (line.productId !== null) {
      const product = await repos.products.findById(commitment.workspaceId, line.productId);
      if (product === null)
        return err("PRODUCT_NOT_FOUND", "A referenced product is not active in this workspace.");
      if (requireActiveSupplier && !product.isActive)
        return err("PRODUCT_NOT_FOUND", "A referenced product is not active in this workspace.");
      if (requireActiveSupplier && product.displayName !== line.productName)
        return err(
          "SUPPLY_COMMITMENT_PRODUCT_SNAPSHOT_MISMATCH",
          "The Supply Commitment line no longer matches the selected Product name.",
          { lineId: line.lineId, productId: line.productId },
        );
    }
    if (line.qualityGradeId !== null) {
      const grade = await repos.qualityGrades.findById(commitment.workspaceId, line.qualityGradeId);
      if (grade === null)
        return err(
          "QUALITY_GRADE_NOT_FOUND",
          "A referenced quality grade is not in this workspace.",
        );
      if (requireActiveSupplier && !grade.isActive)
        return err("QUALITY_GRADE_INACTIVE", "An inactive quality grade cannot be confirmed.");
    }
  }
  return ok(undefined);
}

async function validateReplacement(
  repos: Parameters<Parameters<typeof runCommand>[0]["execute"]>[0]["repos"],
  commitment: SupplyCommitmentState,
  currentCommitmentId?: SupplyCommitmentState["id"],
) {
  if (commitment.replacesSupplyCommitmentId === null) return ok(undefined);
  const original = await repos.supplyCommitments.findByIdForUpdate(
    commitment.workspaceId,
    commitment.replacesSupplyCommitmentId,
  );
  if (original === null || original.status !== "cancelled")
    return err(
      "SUPPLY_COMMITMENT_REPLACEMENT_INVALID",
      "A replacement requires one cancelled Supply Commitment in this workspace.",
    );
  if (original.supplierId !== commitment.supplierId || original.currency !== commitment.currency)
    return err(
      "SUPPLY_COMMITMENT_REPLACEMENT_INVALID",
      "A replacement must keep the cancelled commitment's supplier and currency.",
    );
  const replacement = await repos.supplyCommitments.findReplacementOf(
    commitment.workspaceId,
    original.id,
  );
  if (replacement !== null && replacement.id !== currentCommitmentId)
    return err(
      "SUPPLY_COMMITMENT_REPLACEMENT_ALREADY_EXISTS",
      "This cancelled Supply Commitment already has a replacement.",
    );
  return ok(undefined);
}

export function createSupplyCommitmentDraft(ctx: CommandContext, input: unknown) {
  return runCommand<CreateSupplyCommitmentDraftCommand, SupplyCommitmentDto>({
    commandType: "CreateSupplyCommitmentDraft",
    schema: createSupplyCommitmentDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "supply_commitment.create",
    resultSchema: supplyCommitmentDtoSchema,
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.supplyCommitments.findById(
          command.workspaceId,
          command.payload.supplyCommitmentId,
        )) !== null
      )
        return err(
          "SUPPLY_COMMITMENT_VERSION_CONFLICT",
          "Supply Commitment identity already exists.",
        );
      const decision = decideCreateSupplyCommitmentDraft(command, recordedAt);
      if (!decision.ok) return decision;
      const refs = await validateReferences(repos, decision.value.aggregate, false);
      if (!refs.ok) return refs;
      const replacement = await validateReplacement(repos, decision.value.aggregate);
      if (!replacement.ok) return replacement;
      if (!(await repos.supplyCommitments.insert(decision.value.aggregate)))
        return err(
          "SUPPLY_COMMITMENT_VERSION_CONFLICT",
          "Supply Commitment identity already exists.",
        );
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toSupplyCommitmentDto(decision.value.aggregate));
    },
  });
}

export function updateSupplyCommitmentDraft(ctx: CommandContext, input: unknown) {
  return runCommand<UpdateSupplyCommitmentDraftCommand, SupplyCommitmentDto>({
    commandType: "UpdateSupplyCommitmentDraft",
    schema: updateSupplyCommitmentDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "supply_commitment.update",
    resultSchema: supplyCommitmentDtoSchema,
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.supplyCommitments.findByIdForUpdate(
        command.workspaceId,
        command.payload.supplyCommitmentId,
      );
      if (current === null) return err("SUPPLY_COMMITMENT_NOT_FOUND", "No such Supply Commitment.");
      const decision = decideUpdateSupplyCommitmentDraft(current, command, recordedAt);
      if (!decision.ok) return decision;
      const refs = await validateReferences(repos, decision.value.aggregate, false);
      if (!refs.ok) return refs;
      const replacement = await validateReplacement(repos, decision.value.aggregate, current.id);
      if (!replacement.ok) return replacement;
      if (!(await repos.supplyCommitments.updateDraft(decision.value.aggregate, current.version)))
        return err(
          "SUPPLY_COMMITMENT_VERSION_CONFLICT",
          "Supply Commitment changed on the server.",
        );
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toSupplyCommitmentDto(decision.value.aggregate));
    },
  });
}

export function confirmSupplyCommitment(ctx: CommandContext, input: unknown) {
  return runCommand<ConfirmSupplyCommitmentCommand, SupplyCommitmentDto>({
    commandType: "ConfirmSupplyCommitment",
    schema: confirmSupplyCommitmentCommandSchema,
    input,
    ctx,
    requiredPermission: "supply_commitment.confirm",
    resultSchema: supplyCommitmentDtoSchema,
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.supplyCommitments.findByIdForUpdate(
        command.workspaceId,
        command.payload.supplyCommitmentId,
      );
      if (current === null) return err("SUPPLY_COMMITMENT_NOT_FOUND", "No such Supply Commitment.");
      const refs = await validateReferences(repos, current, true);
      if (!refs.ok) return refs;
      const decision = decideConfirmSupplyCommitment(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.supplyCommitments.confirm(decision.value.aggregate, current.version)))
        return err(
          "SUPPLY_COMMITMENT_VERSION_CONFLICT",
          "Supply Commitment changed on the server.",
        );
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toSupplyCommitmentDto(decision.value.aggregate));
    },
  });
}

export function cancelSupplyCommitment(ctx: CommandContext, input: unknown) {
  return runCommand<CancelSupplyCommitmentCommand, SupplyCommitmentDto>({
    commandType: "CancelSupplyCommitment",
    schema: cancelSupplyCommitmentCommandSchema,
    input,
    ctx,
    requiredPermission: "supply_commitment.cancel",
    resultSchema: supplyCommitmentDtoSchema,
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.supplyCommitments.findByIdForUpdate(
        command.workspaceId,
        command.payload.supplyCommitmentId,
      );
      if (current === null) return err("SUPPLY_COMMITMENT_NOT_FOUND", "No such Supply Commitment.");
      const decision = decideCancelSupplyCommitment(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.supplyCommitments.cancel(decision.value.aggregate, current.version)))
        return err(
          "SUPPLY_COMMITMENT_VERSION_CONFLICT",
          "Supply Commitment changed on the server.",
        );
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toSupplyCommitmentDto(decision.value.aggregate));
    },
  });
}
