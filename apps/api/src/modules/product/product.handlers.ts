import type {
  CreateProductCommand,
  AuditAction,
  DeactivateProductCommand,
  ProductDto,
  ReactivateProductCommand,
  UpdateProductCommand,
} from "@vuarau/domain-contracts";
import type { z } from "zod";
import {
  createProductCommandSchema,
  deactivateProductCommandSchema,
  reactivateProductCommandSchema,
  updateProductCommandSchema,
} from "@vuarau/domain-contracts";
import {
  decideCreateProduct,
  decideProductLifecycle,
  decideUpdateProduct,
  err,
  ok,
} from "@vuarau/domain-kernel";
import type { ProductState } from "@vuarau/domain-kernel";
import type { DomainResult } from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

const dto = (product: ProductState): ProductDto => ({
  id: product.id,
  workspaceId: product.workspaceId,
  displayName: product.displayName,
  aliases: [...product.aliases],
  preferredUnit: product.preferredUnit,
  isActive: product.isActive,
  version: product.version,
  createdAt: product.createdAt,
  updatedAt: product.updatedAt,
});

export function createProduct(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<ProductDto>> {
  return runCommand<CreateProductCommand, ProductDto>({
    commandType: "CreateProduct",
    schema: createProductCommandSchema,
    input,
    ctx,
    requiredPermission: "product.create",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.products.findById(command.workspaceId, command.payload.productId)) !== null
      ) {
        return err("PRODUCT_VERSION_CONFLICT", "Product identity already exists.");
      }
      const decision = decideCreateProduct(command, recordedAt);
      if (!decision.ok) return decision;
      await repos.products.insert(decision.value);
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "product",
        aggregateId: decision.value.id,
        action: "product.created",
        transactionTime: command.occurredAt,
        recordedAt,
        before: null,
        after: { isActive: true, version: 1 },
        reason: null,
      });
      return ok(dto(decision.value));
    },
  });
}

function mutateProduct<
  TCommand extends UpdateProductCommand | DeactivateProductCommand | ReactivateProductCommand,
>(args: {
  ctx: CommandContext;
  input: unknown;
  commandType: string;
  schema: z.ZodType<TCommand>;
  permission: "product.update" | "product.deactivate" | "product.reactivate";
  decide: (
    current: ProductState,
    command: TCommand,
    recordedAt: ProductState["updatedAt"],
  ) => DomainResult<ProductState>;
  action: AuditAction;
}): Promise<DomainResult<ProductDto>> {
  return runCommand<TCommand, ProductDto>({
    commandType: args.commandType,
    schema: args.schema,
    input: args.input,
    ctx: args.ctx,
    requiredPermission: args.permission,
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.products.findByIdForUpdate(
        command.workspaceId,
        command.payload.productId,
      );
      if (current === null) return err("PRODUCT_NOT_FOUND", "No such product.");
      const decision = args.decide(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.products.update(decision.value, current.version))) {
        return err("PRODUCT_VERSION_CONFLICT", "Product changed on the server.");
      }
      await repos.audit.append({
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
        aggregateType: "product",
        aggregateId: current.id,
        action: args.action,
        transactionTime: command.occurredAt,
        recordedAt,
        before: { isActive: current.isActive, version: current.version },
        after: { isActive: decision.value.isActive, version: decision.value.version },
        reason: "reason" in command.payload ? command.payload.reason : null,
      });
      return ok(dto(decision.value));
    },
  });
}

export const updateProduct = (ctx: CommandContext, input: unknown) =>
  mutateProduct<UpdateProductCommand>({
    ctx,
    input,
    commandType: "UpdateProduct",
    schema: updateProductCommandSchema,
    permission: "product.update",
    action: "product.updated",
    decide: decideUpdateProduct,
  });

export const deactivateProduct = (ctx: CommandContext, input: unknown) =>
  mutateProduct<DeactivateProductCommand>({
    ctx,
    input,
    commandType: "DeactivateProduct",
    schema: deactivateProductCommandSchema,
    permission: "product.deactivate",
    action: "product.deactivated",
    decide: (current, command, at) => decideProductLifecycle(current, command, false, at),
  });

export const reactivateProduct = (ctx: CommandContext, input: unknown) =>
  mutateProduct<ReactivateProductCommand>({
    ctx,
    input,
    commandType: "ReactivateProduct",
    schema: reactivateProductCommandSchema,
    permission: "product.reactivate",
    action: "product.reactivated",
    decide: (current, command, at) => decideProductLifecycle(current, command, true, at),
  });
