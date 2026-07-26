import type { IsoInstant } from "@vuanha/domain-contracts";
import { ACTOR_ID, LATEST_RECORDED_AT, WORKSPACE_ID, activeCustomer } from "@vuanha/test-fixtures";
import type { Clock } from "../infrastructure/clock.ts";
import type { CommandDeps } from "../modules/shared/command-pipeline.ts";
import {
  InMemoryDatabase,
  sequentialIdGenerator,
} from "../infrastructure/persistence/in-memory/in-memory-unit-of-work.ts";

/**
 * Wiring for the application and contract test projects: real handlers, real
 * pipeline, real in-memory repositories. Nothing is stubbed.
 *
 * The clock defaults to the latest fixture instant so that every fixture's
 * `occurredAt` is in the past — back-dating is normal, forward-dating is refused
 * (BR-COMMAND-004), and a harness that tripped that check in every test would be
 * testing the wrong thing.
 */
export type MutableClock = Clock & { set(instant: IsoInstant): void };

export function mutableClock(initial: IsoInstant = LATEST_RECORDED_AT): MutableClock {
  let current = initial;
  return {
    now: () => current,
    set: (instant) => {
      current = instant;
    },
  };
}

export type Harness = {
  readonly db: InMemoryDatabase;
  readonly deps: CommandDeps;
  readonly clock: MutableClock;
};

export function createHarness(): Harness {
  const db = new InMemoryDatabase(sequentialIdGenerator());
  db.grantMembership(WORKSPACE_ID, ACTOR_ID);
  db.seedCustomer(activeCustomer);

  const clock = mutableClock();
  return { db, deps: { uow: db.unitOfWork(), clock }, clock };
}

/** Sums a customer's ledger entries — the only definition of a balance there is. */
export function ledgerBalance(harness: Harness, customerId: string): number {
  return harness.db
    .ledgerFor(WORKSPACE_ID, customerId)
    .reduce((total, entry) => total + entry.amount.amountMinor, 0);
}
