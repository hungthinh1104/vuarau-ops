import type { PaymentId, WorkspaceId } from "@vuarau/domain-contracts";
import type { PaymentReversalState, PaymentState } from "@vuarau/domain-kernel";

export type PaymentRepository = {
  findByIdForUpdate(workspaceId: WorkspaceId, paymentId: PaymentId): Promise<PaymentState | null>;
  insert(payment: PaymentState): Promise<void>;
  update(payment: PaymentState, expectedVersion: number): Promise<boolean>;
  insertReversal(reversal: PaymentReversalState): Promise<void>;
};
