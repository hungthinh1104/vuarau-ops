import type { IsoInstant } from "@vuarau/domain-contracts";

/**
 * The only source of `recordedAt` in the system.
 *
 * It is a port so that tests can be deterministic and so that the domain kernel
 * never has to reach for a clock — it receives the instant as an argument
 * (ADR-0003). Read once per command, then stamped on every row that command
 * writes, so all effects of one command share one recording instant.
 */
export type Clock = {
  now(): IsoInstant;
};

export const systemClock: Clock = {
  now: () => new Date().toISOString() as IsoInstant,
};

/**
 * Ids for rows the domain does not name: account entries and audit records.
 * A port for the same reason as the clock — a decision function that generated a
 * UUID would stop being deterministic.
 */
export type IdGenerator = {
  newId(): string;
};

export const randomIdGenerator: IdGenerator = {
  newId: () => crypto.randomUUID(),
};
