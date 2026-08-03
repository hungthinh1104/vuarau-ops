import type { CustomerDetailDto, DomainError } from "@vuarau/domain-contracts";

export const OFFLINE_DATABASE_VERSION = 3;

export type OfflineCommandKind = "customer.create" | "sale.createDraft" | "sale.post";
export type OfflineCommandState =
  "queued" | "syncing" | "confirmed" | "retry_wait" | "blocked" | "rejected";

export type FrozenCommandEnvelope = {
  readonly commandId: string;
  readonly idempotencyKey: string;
  readonly workspaceId: string;
  readonly actorId: string;
  readonly occurredAt: string;
  readonly expectedVersion?: number;
  readonly payload: unknown;
};

export type OutboxRecord = {
  readonly id: string;
  readonly chainId: string;
  readonly sequence: number;
  readonly kind: OfflineCommandKind;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly envelope: FrozenCommandEnvelope;
  readonly createdAt: string;
  readonly state: OfflineCommandState;
  readonly attempts: number;
  readonly lastAttemptAt: string | null;
  readonly result: unknown | null;
  readonly error: DomainError | null;
};

export type OfflineSaleDraft = {
  readonly saleId: string;
  readonly customerId: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly lines: readonly unknown[];
  readonly note: string | null;
  readonly evidenceReferences: readonly string[];
  /** Server-authored customer context needed to reopen a queued sale offline. */
  readonly customerSnapshot?: CustomerDetailDto;
  readonly occurredAt: string;
  readonly syncState: "local" | OfflineCommandState;
  readonly updatedAt: string;
};

export type CachedCustomer = {
  readonly customerId: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly phone: string | null;
  /** The server-authored balance/capabilities are a stale snapshot, never a rule. */
  readonly detail: CustomerDetailDto;
  readonly fetchedAt: string;
  /** Present only for a customer staged locally before any request was sent. */
  readonly pendingCreate?: {
    readonly customerId: string;
    readonly displayName: string;
    readonly phone: string | null;
    readonly note: string | null;
  };
};

export type CachedProduct = {
  readonly productId: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly preferredUnit: string | null;
  readonly fetchedAt: string;
};

export type CachedQualityGrade = {
  readonly qualityGradeId: string;
  readonly actorId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly fetchedAt: string;
};

export type OfflinePartition = {
  readonly actorId: string;
  readonly workspaceId: string;
};

export function partitionKey(partition: OfflinePartition): string {
  return `${partition.actorId}:${partition.workspaceId}`;
}

export function recordKey(partition: OfflinePartition, id: string): string {
  return `${partitionKey(partition)}:${id}`;
}
