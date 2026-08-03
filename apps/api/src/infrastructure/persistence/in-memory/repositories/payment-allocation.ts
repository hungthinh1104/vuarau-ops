import type { Repositories } from "../../ports.ts";
import type {
  PaymentAllocationDto,
  PaymentAllocationReversalDto,
  WorkspaceBackupV17,
} from "@vuarau/domain-contracts";
import { key } from "../store.ts";
import type { Store } from "../store.ts";

export const createPaymentAllocationRepositories = (
  store: Store,
): Pick<Repositories, "paymentAllocations"> => ({
  paymentAllocations: {
    findByIdForUpdate: async (workspaceId, allocationId) =>
      store.paymentAllocations.find(
        (allocation) => allocation.workspaceId === workspaceId && allocation.id === allocationId,
      ) ?? null,
    listByCustomer: async (workspaceId, customerId) => ({
      allocations: store.paymentAllocations.filter(
        (allocation) =>
          allocation.workspaceId === workspaceId && allocation.customerId === customerId,
      ),
      reversals: store.paymentAllocationReversals.filter(
        (reversal) => reversal.workspaceId === workspaceId && reversal.customerId === customerId,
      ),
    }),
    insert: async (allocation) => {
      if (store.paymentAllocations.some((current) => current.id === allocation.id)) return false;
      store.paymentAllocations.push(allocation);
      return true;
    },
    insertReversal: async (reversal) => {
      if (store.paymentAllocationReversals.some((current) => current.id === reversal.id))
        return false;
      if (
        store.paymentAllocations.find(
          (allocation) =>
            key(allocation.workspaceId, allocation.id) ===
            key(reversal.workspaceId, reversal.allocationId),
        ) === undefined
      )
        return false;
      store.paymentAllocationReversals.push(reversal);
      return true;
    },
  },
});

export function restorePaymentAllocationFacts(
  store: Store,
  payload: WorkspaceBackupV17["payload"],
  remap: <T extends Record<string, unknown>>(row: T) => T & { workspaceId: string },
): void {
  for (const raw of payload.paymentAllocations) {
    store.paymentAllocations.push(
      remap({
        ...raw,
        evidenceReferences: raw["evidenceReferences"] ?? [],
      }) as unknown as PaymentAllocationDto,
    );
  }
  for (const raw of payload.paymentAllocationReversals) {
    store.paymentAllocationReversals.push(
      remap({
        ...raw,
        evidenceReferences: raw["evidenceReferences"] ?? [],
      }) as unknown as PaymentAllocationReversalDto,
    );
  }
}
