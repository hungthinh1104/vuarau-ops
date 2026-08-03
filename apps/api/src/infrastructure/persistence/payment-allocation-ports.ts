import type {
  CustomerId,
  PaymentAllocationDto,
  PaymentAllocationReversalDto,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type PaymentAllocationRepository = {
  findByIdForUpdate(
    workspaceId: WorkspaceId,
    allocationId: PaymentAllocationDto["id"],
  ): Promise<PaymentAllocationDto | null>;
  listByCustomer(
    workspaceId: WorkspaceId,
    customerId: CustomerId,
  ): Promise<{
    readonly allocations: readonly PaymentAllocationDto[];
    readonly reversals: readonly PaymentAllocationReversalDto[];
  }>;
  insert(allocation: PaymentAllocationDto): Promise<boolean>;
  insertReversal(reversal: PaymentAllocationReversalDto): Promise<boolean>;
};
