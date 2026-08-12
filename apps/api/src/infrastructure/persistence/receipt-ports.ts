import type {
  CommandId,
  IdempotencyKey,
  IsoInstant,
  WorkspaceChange,
  WorkspaceChangeTopic,
  WorkspaceId,
} from "@vuarau/domain-contracts";

export type CommandReceiptStatus = "in_progress" | "completed";

export type CommandReceipt = {
  readonly commandId: CommandId;
  readonly workspaceId: WorkspaceId;
  readonly idempotencyKey: IdempotencyKey;
  readonly commandType: string;
  readonly payloadHash: string;
  readonly status: CommandReceiptStatus;
  readonly result: unknown;
  readonly recordedAt: IsoInstant;
  readonly revision?: string | null;
};

export type CommandCompletion = {
  readonly revision: string;
  readonly topics: readonly WorkspaceChangeTopic[];
};

export type WorkspaceChangePage = {
  readonly changes: readonly WorkspaceChange[];
  readonly nextRevision: string;
};

export type CommandReceiptRepository = {
  find(workspaceId: WorkspaceId, idempotencyKey: IdempotencyKey): Promise<CommandReceipt | null>;
  findByCommandId(workspaceId: WorkspaceId, commandId: CommandId): Promise<CommandReceipt | null>;
  claim(receipt: CommandReceipt): Promise<boolean>;
  complete(
    workspaceId: WorkspaceId,
    idempotencyKey: IdempotencyKey,
    result: unknown,
    change?: { readonly topics: readonly WorkspaceChangeTopic[] },
  ): Promise<CommandCompletion>;
  changesSince(
    workspaceId: WorkspaceId,
    revision: string,
    limit: number,
  ): Promise<WorkspaceChangePage>;
};
