import type { DomainError } from "@vuarau/domain-contracts";
import type { OfflineDatabase } from "./database.ts";
import type { FrozenCommandEnvelope, OfflinePartition, OutboxRecord } from "./types.ts";

export type OfflineSender = (
  kind: OutboxRecord["kind"],
  envelope: FrozenCommandEnvelope,
) => Promise<unknown>;

export type ErrorClassifier = (error: unknown) => DomainError | null;

const TERMINAL_CODES = new Set([
  "AUTHENTICATION_REQUIRED",
  "AUTHENTICATION_INVALID",
  "ACTOR_NOT_FOUND",
  "ACTOR_IMPERSONATION_DENIED",
  "WORKSPACE_ACCESS_DENIED",
  "WORKSPACE_MEMBERSHIP_INACTIVE",
  "PERMISSION_DENIED",
  "INVALID_COMMAND_PAYLOAD",
  "DUPLICATE_COMMAND",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_PAYLOAD",
  "IDEMPOTENCY_KEY_REUSED_WITH_DIFFERENT_COMMAND",
  "PILOT_SCOPE_EXCLUDED",
]);

function nextState(error: DomainError | null): OutboxRecord["state"] {
  if (error === null || error.retryable) return "retry_wait";
  return TERMINAL_CODES.has(error.code) ? "rejected" : "blocked";
}

export class OfflineSyncEngine {
  private readonly running = new Set<string>();

  constructor(
    private readonly database: OfflineDatabase,
    private readonly send: OfflineSender,
    private readonly classify: ErrorClassifier,
    private readonly concurrency = 2,
  ) {}

  async sync(partition: OfflinePartition): Promise<void> {
    const partitionKey = `${partition.actorId}:${partition.workspaceId}`;
    if (this.running.has(partitionKey)) return;
    this.running.add(partitionKey);
    try {
      const records = await this.database.commands(partition);
      const chains = new Map<string, OutboxRecord[]>();
      for (const record of records) {
        const chain = chains.get(record.chainId) ?? [];
        chain.push(record);
        chains.set(record.chainId, chain);
      }
      const pendingChains = [...chains.values()].filter((chain) =>
        chain.some((record) => record.state !== "confirmed"),
      );
      let hadConfirmation = false;
      for (let index = 0; index < pendingChains.length; index += this.concurrency) {
        const confirmations = await Promise.all(
          pendingChains
            .slice(index, index + this.concurrency)
            .map((chain) => this.syncChain(partition, chain)),
        );
        hadConfirmation ||= confirmations.some(Boolean);
      }
      if (hadConfirmation) {
        await this.database.markSuccessfulSync(partition, new Date().toISOString());
      }
    } finally {
      this.running.delete(partitionKey);
    }
  }

  private async syncChain(
    partition: OfflinePartition,
    chain: readonly OutboxRecord[],
  ): Promise<boolean> {
    let confirmed = false;
    const accepted = new Set<string>();
    for (const record of [...chain].sort((a, b) => a.sequence - b.sequence)) {
      if (record.state === "confirmed") continue;
      if (
        record.state === "dependency_blocked" &&
        (record.dependencyBlockedBy === undefined ||
          record.dependencyBlockedBy === null ||
          !accepted.has(record.dependencyBlockedBy))
      )
        return confirmed;
      if (record.state === "rejected" || record.state === "blocked") return confirmed;
      const syncing: OutboxRecord = {
        ...record,
        state: "syncing",
        attempts: record.attempts + 1,
        lastAttemptAt: new Date().toISOString(),
      };
      await this.database.updateCommand(partition, syncing);
      try {
        const result = await this.send(record.kind, record.envelope);
        await this.database.updateCommand(partition, {
          ...syncing,
          state: "confirmed",
          result,
          error: null,
          dependencyBlockedBy: null,
        });
        accepted.add(record.id);
        const releaseDependents = (
          this.database as OfflineDatabase & {
            releaseDependents?: (partition: OfflinePartition, blockerId: string) => Promise<void>;
          }
        ).releaseDependents;
        if (releaseDependents !== undefined) {
          await releaseDependents.call(this.database, partition, record.id);
        }
        confirmed = true;
      } catch (error) {
        const domainError = this.classify(error);
        const state = nextState(domainError);
        if (state === "blocked" || state === "rejected") {
          const settleFailedCommand = (
            this.database as OfflineDatabase & {
              settleFailedCommand?: (args: {
                partition: OfflinePartition;
                record: OutboxRecord;
                state: "blocked" | "rejected";
                error: DomainError | null;
              }) => Promise<void>;
            }
          ).settleFailedCommand;
          if (settleFailedCommand !== undefined) {
            await settleFailedCommand.call(this.database, {
              partition,
              record: syncing,
              state,
              error: domainError,
            });
          } else {
            await this.database.updateCommand(partition, {
              ...syncing,
              state,
              error: domainError,
              dependencyBlockedBy: null,
            });
            for (const descendant of chain) {
              if (descendant.sequence <= record.sequence || descendant.state === "confirmed")
                continue;
              await this.database.updateCommand(partition, {
                ...descendant,
                state: "dependency_blocked",
                dependencyBlockedBy: record.id,
              });
            }
          }
        } else {
          await this.database.updateCommand(partition, {
            ...syncing,
            state,
            error: domainError,
            dependencyBlockedBy: null,
          });
        }
        return confirmed;
      }
    }
    return confirmed;
  }
}
