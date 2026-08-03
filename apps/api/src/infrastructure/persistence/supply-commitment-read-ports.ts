import type {
  SupplierId,
  SupplyCommitmentId,
  SupplyCommitmentStatus,
  WorkspaceId,
} from "@vuarau/domain-contracts";
import type { SupplyCommitmentState } from "@vuarau/domain-kernel";
import type { PageQuery, PageResult } from "./read-ports.ts";

export type SupplyCommitmentReadRepository = {
  get(workspaceId: WorkspaceId, id: SupplyCommitmentId): Promise<SupplyCommitmentState | null>;
  list(args: {
    workspaceId: WorkspaceId;
    supplierId: SupplierId | null;
    status: SupplyCommitmentStatus | null;
    page: PageQuery;
  }): Promise<PageResult<SupplyCommitmentState>>;
};
