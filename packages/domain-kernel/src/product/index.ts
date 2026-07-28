import type {
  CreateProductCommand,
  DeactivateProductCommand,
  IsoInstant,
  ReactivateProductCommand,
  UpdateProductCommand,
} from "@vuarau/domain-contracts";
import type { ProductState } from "../shared/state.ts";
import type { DomainResult } from "../shared/result.ts";
import { err, ok } from "../shared/result.ts";

function cleanNames(displayName: string, aliases: readonly string[]) {
  const name = displayName.trim();
  if (name.length === 0) return null;
  return {
    displayName: name,
    aliases: [...new Set(aliases.map((alias) => alias.trim()).filter(Boolean))].filter(
      (alias) => alias !== name,
    ),
  };
}

export function decideCreateProduct(
  command: CreateProductCommand,
  recordedAt: IsoInstant,
): DomainResult<ProductState> {
  const names = cleanNames(command.payload.displayName, command.payload.aliases);
  if (names === null) return err("INVALID_COMMAND_PAYLOAD", "Product name is required.");
  return ok({
    id: command.payload.productId,
    workspaceId: command.workspaceId,
    ...names,
    preferredUnit: command.payload.preferredUnit,
    isActive: true,
    version: 1,
    createdAt: recordedAt,
    updatedAt: recordedAt,
  });
}

export function decideUpdateProduct(
  current: ProductState,
  command: UpdateProductCommand,
  recordedAt: IsoInstant,
): DomainResult<ProductState> {
  if (current.version !== command.expectedVersion)
    return err("PRODUCT_VERSION_CONFLICT", "Product changed on the server.");
  const names = cleanNames(command.payload.displayName, command.payload.aliases);
  if (names === null) return err("INVALID_COMMAND_PAYLOAD", "Product name is required.");
  return ok({
    ...current,
    ...names,
    preferredUnit: command.payload.preferredUnit,
    version: current.version + 1,
    updatedAt: recordedAt,
  });
}

export function decideProductLifecycle(
  current: ProductState,
  command: DeactivateProductCommand | ReactivateProductCommand,
  active: boolean,
  recordedAt: IsoInstant,
): DomainResult<ProductState> {
  if (current.version !== command.expectedVersion)
    return err("PRODUCT_VERSION_CONFLICT", "Product changed on the server.");
  if (current.isActive === active)
    return err("INVALID_COMMAND_PAYLOAD", `Product is already ${active ? "active" : "inactive"}.`);
  return ok({ ...current, isActive: active, version: current.version + 1, updatedAt: recordedAt });
}
