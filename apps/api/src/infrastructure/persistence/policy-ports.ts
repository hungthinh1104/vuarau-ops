import type {
  WorkspacePolicyDto,
  WorkspacePolicyKind,
  WorkspacePolicyState,
  WorkspacePolicyVersionId,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type WorkspacePolicyPageQuery = {
  readonly after: { readonly sortValue: string; readonly id: string } | null;
  readonly limit: number;
};
export type WorkspacePolicyPageResult = {
  readonly rows: readonly WorkspacePolicyDto[];
  readonly next: { readonly sortValue: string; readonly id: string } | null;
};

export type WorkspacePolicyRepository = {
  findById(
    workspaceId: WorkspaceId,
    policyVersionId: WorkspacePolicyVersionId,
  ): Promise<WorkspacePolicyDto | null>;
  listForUpdate(
    workspaceId: WorkspaceId,
    policyKind: WorkspacePolicyKind,
  ): Promise<readonly WorkspacePolicyDto[]>;
  insert(policy: WorkspacePolicyDto): Promise<boolean>;
  update(policy: WorkspacePolicyDto, expectedState: WorkspacePolicyState): Promise<boolean>;
};

export type WorkspacePolicyReadRepository = {
  findById(
    workspaceId: WorkspaceId,
    policyVersionId: WorkspacePolicyVersionId,
  ): Promise<WorkspacePolicyDto | null>;
  list(args: {
    workspaceId: WorkspaceId;
    policyKind: WorkspacePolicyKind | null;
    state: WorkspacePolicyState | null;
    page: WorkspacePolicyPageQuery;
  }): Promise<WorkspacePolicyPageResult>;
  listAll(workspaceId: WorkspaceId): Promise<readonly WorkspacePolicyDto[]>;
};
