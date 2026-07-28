import type { DomainError } from "@vuarau/domain-contracts";
import type { OfflineDatabase } from "./database.ts";
import type { FrozenCommandEnvelope, OfflinePartition, OutboxRecord } from "./types.ts";

export type OfflineSender = (
  kind: OutboxRecord["kind"],
  envelope: FrozenCommandEnvelope,
) => Promise<unknown>;

export type ErrorClassifier = (error: unknown) => DomainError | null;

const BLOCKING_CODES = new Set([
  "CUSTOMER_VERSION_CONFLICT",
  "SALE_VERSION_CONFLICT",
  "SALE_REPLACEMENT_NOT_VOIDED",
]);

function nextState(error: DomainError | null): OutboxRecord["state"] {
  if (error === null || error.retryable) return "retry_wait";
  return BLOCKING_CODES.has(error.code) ? "blocked" : "rejected";
}

export class OfflineSyncEngine {
  private running = false;

  constructor(
    private readonly database: OfflineDatabase,
    private readonly send: OfflineSender,
    private readonly classify: ErrorClassifier,
    private readonly concurrency = 2,
  ) {}

  async sync(partition: OfflinePartition): Promise<void> {
    if (this.running) return;
    this.running = true;
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
      this.running = false;
    }
  }

  private async syncChain(
    partition: OfflinePartition,
    chain: readonly OutboxRecord[],
  ): Promise<boolean> {
    let confirmed = false;
    for (const record of [...chain].sort((a, b) => a.sequence - b.sequence)) {
      if (record.state === "confirmed") continue;
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
        });
        confirmed = true;
      } catch (error) {
        const domainError = this.classify(error);
        await this.database.updateCommand(partition, {
          ...syncing,
          state: nextState(domainError),
          error: domainError,
        });
        return confirmed;
      }
    }
    return confirmed;
  }
}
