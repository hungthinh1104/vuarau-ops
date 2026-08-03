import type { CustomerOrderId } from "@vuarau/domain-contracts";
import type { CustomerOrderState } from "@vuarau/domain-kernel";

export type CustomerOrderRepository = {
  findById(
    workspaceId: string,
    customerOrderId: CustomerOrderId,
  ): Promise<CustomerOrderState | null>;
  findByIdForUpdate(
    workspaceId: string,
    customerOrderId: CustomerOrderId,
  ): Promise<CustomerOrderState | null>;
  findReplacementOf(
    workspaceId: string,
    customerOrderId: CustomerOrderId,
  ): Promise<CustomerOrderState | null>;
  insert(order: CustomerOrderState): Promise<boolean>;
  updateDraft(order: CustomerOrderState, expectedVersion: number): Promise<boolean>;
  confirm(order: CustomerOrderState, expectedVersion: number): Promise<boolean>;
  cancel(order: CustomerOrderState, expectedVersion: number): Promise<boolean>;
};
