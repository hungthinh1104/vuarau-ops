import type {
  CancelCustomerOrderCommand,
  ConfirmCustomerOrderCommand,
  CreateCustomerOrderDraftCommand,
  CustomerOrderDto,
  UpdateCustomerOrderDraftCommand,
} from "@vuarau/domain-contracts";
import {
  cancelCustomerOrderCommandSchema,
  confirmCustomerOrderCommandSchema,
  createCustomerOrderDraftCommandSchema,
  updateCustomerOrderDraftCommandSchema,
} from "@vuarau/domain-contracts";
import type { CustomerOrderState, DomainResult } from "@vuarau/domain-kernel";
import {
  decideCancelCustomerOrder,
  decideConfirmCustomerOrder,
  decideCreateCustomerOrderDraft,
  decideUpdateCustomerOrderDraft,
  err,
  customerOrderCapabilities,
  ok,
} from "@vuarau/domain-kernel";
import type { CommandContext } from "../shared/command-pipeline.ts";
import { runCommand } from "../shared/command-pipeline.ts";

export function toCustomerOrderDto(order: CustomerOrderState): CustomerOrderDto {
  return {
    ...order,
    lines: order.lines.map((line) => ({ ...line })),
    paymentTermsSnapshot:
      order.paymentTermsSnapshot === null ? null : { ...order.paymentTermsSnapshot },
    evidenceReferences: [...order.evidenceReferences],
    capabilities: customerOrderCapabilities(order),
  };
}

async function validateReferences(
  repos: Parameters<Parameters<typeof runCommand>[0]["execute"]>[0]["repos"],
  order: CustomerOrderState,
  requireActive: boolean,
) {
  if (order.customerId !== null) {
    const customer = await repos.customers.findById(order.workspaceId, order.customerId);
    if (customer === null)
      return err("CUSTOMER_NOT_FOUND", "No such customer in this workspace.", {
        customerId: order.customerId,
      });
    if (requireActive && !customer.isActive)
      return err(
        "CUSTOMER_ALREADY_INACTIVE",
        "An inactive customer cannot be confirmed on a new order.",
      );
  }
  for (const line of order.lines) {
    if (line.productId === null) continue;
    const product = await repos.products.findById(order.workspaceId, line.productId);
    if (product === null)
      return err("PRODUCT_NOT_FOUND", "A referenced product is not in this workspace.", {
        productId: line.productId,
      });
    if (requireActive && !product.isActive)
      return err("PRODUCT_NOT_FOUND", "An inactive product cannot be confirmed on a new order.", {
        productId: line.productId,
      });
  }
  return ok(undefined);
}

async function validateReplacement(
  repos: Parameters<Parameters<typeof runCommand>[0]["execute"]>[0]["repos"],
  order: CustomerOrderState,
) {
  if (order.replacesCustomerOrderId === null) return ok(undefined);
  const original = await repos.customerOrders.findByIdForUpdate(
    order.workspaceId,
    order.replacesCustomerOrderId,
  );
  if (original === null || original.status !== "cancelled")
    return err(
      "CUSTOMER_ORDER_REPLACEMENT_INVALID",
      "A replacement requires one cancelled Customer Order in this workspace.",
    );
  if ((await repos.customerOrders.findReplacementOf(order.workspaceId, original.id)) !== null)
    return err(
      "CUSTOMER_ORDER_REPLACEMENT_ALREADY_EXISTS",
      "This cancelled Customer Order already has a replacement.",
    );
  return ok(undefined);
}

export function createCustomerOrderDraft(
  ctx: CommandContext,
  input: unknown,
): Promise<DomainResult<CustomerOrderDto>> {
  return runCommand<CreateCustomerOrderDraftCommand, CustomerOrderDto>({
    commandType: "CreateCustomerOrderDraft",
    schema: createCustomerOrderDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "customer_order.create",
    execute: async ({ command, repos, recordedAt }) => {
      if (
        (await repos.customerOrders.findById(
          command.workspaceId,
          command.payload.customerOrderId,
        )) !== null
      )
        return err("CUSTOMER_ORDER_VERSION_CONFLICT", "Customer Order identity already exists.");
      const decision = decideCreateCustomerOrderDraft(command, recordedAt);
      if (!decision.ok) return decision;
      const references = await validateReferences(repos, decision.value.aggregate, false);
      if (!references.ok) return references;
      const replacement = await validateReplacement(repos, decision.value.aggregate);
      if (!replacement.ok) return replacement;
      if (!(await repos.customerOrders.insert(decision.value.aggregate)))
        return err(
          "CUSTOMER_ORDER_REPLACEMENT_ALREADY_EXISTS",
          "Customer Order identity or replacement already exists.",
        );
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toCustomerOrderDto(decision.value.aggregate));
    },
  });
}

export function updateCustomerOrderDraft(ctx: CommandContext, input: unknown) {
  return runCommand<UpdateCustomerOrderDraftCommand, CustomerOrderDto>({
    commandType: "UpdateCustomerOrderDraft",
    schema: updateCustomerOrderDraftCommandSchema,
    input,
    ctx,
    requiredPermission: "customer_order.update",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.customerOrders.findByIdForUpdate(
        command.workspaceId,
        command.payload.customerOrderId,
      );
      if (current === null) return err("CUSTOMER_ORDER_NOT_FOUND", "No such Customer Order.");
      const decision = decideUpdateCustomerOrderDraft(current, command, recordedAt);
      if (!decision.ok) return decision;
      const references = await validateReferences(repos, decision.value.aggregate, false);
      if (!references.ok) return references;
      if (!(await repos.customerOrders.updateDraft(decision.value.aggregate, current.version)))
        return err("CUSTOMER_ORDER_VERSION_CONFLICT", "Customer Order changed on the server.");
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toCustomerOrderDto(decision.value.aggregate));
    },
  });
}

export function confirmCustomerOrder(ctx: CommandContext, input: unknown) {
  return runCommand<ConfirmCustomerOrderCommand, CustomerOrderDto>({
    commandType: "ConfirmCustomerOrder",
    schema: confirmCustomerOrderCommandSchema,
    input,
    ctx,
    requiredPermission: "customer_order.confirm",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.customerOrders.findByIdForUpdate(
        command.workspaceId,
        command.payload.customerOrderId,
      );
      if (current === null) return err("CUSTOMER_ORDER_NOT_FOUND", "No such Customer Order.");
      const references = await validateReferences(repos, current, true);
      if (!references.ok) return references;
      const decision = decideConfirmCustomerOrder(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.customerOrders.confirm(decision.value.aggregate, current.version)))
        return err("CUSTOMER_ORDER_VERSION_CONFLICT", "Customer Order changed on the server.");
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toCustomerOrderDto(decision.value.aggregate));
    },
  });
}

export function cancelCustomerOrder(ctx: CommandContext, input: unknown) {
  return runCommand<CancelCustomerOrderCommand, CustomerOrderDto>({
    commandType: "CancelCustomerOrder",
    schema: cancelCustomerOrderCommandSchema,
    input,
    ctx,
    requiredPermission: "customer_order.cancel",
    execute: async ({ command, repos, recordedAt }) => {
      const current = await repos.customerOrders.findByIdForUpdate(
        command.workspaceId,
        command.payload.customerOrderId,
      );
      if (current === null) return err("CUSTOMER_ORDER_NOT_FOUND", "No such Customer Order.");
      const decision = decideCancelCustomerOrder(current, command, recordedAt);
      if (!decision.ok) return decision;
      if (!(await repos.customerOrders.cancel(decision.value.aggregate, current.version)))
        return err("CUSTOMER_ORDER_VERSION_CONFLICT", "Customer Order changed on the server.");
      await repos.audit.append({
        ...decision.value.audit,
        workspaceId: command.workspaceId,
        actorId: command.actorId,
        commandId: command.commandId,
      });
      return ok(toCustomerOrderDto(decision.value.aggregate));
    },
  });
}
