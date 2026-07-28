import type { ActorId, IsoInstant, WorkspaceRole } from "@vuarau/domain-contracts";
import {
  ACCOUNTANT_ACTOR_ID,
  ACTOR_ID,
  DELIVERY_ACTOR_ID,
  FOREIGN_ACTOR_ID,
  LATEST_RECORDED_AT,
  OTHER_WORKSPACE_ID,
  OTHER_WORKSPACE_NAME,
  REVOKED_ACTOR_ID,
  SALES_ACTOR_ID,
  WAREHOUSE_ACTOR_ID,
  WORKSPACE_ID,
  WORKSPACE_NAME,
  PRODUCT_CA_CHUA_ID,
  PRODUCT_OT_ID,
  PRODUCT_RAU_MUONG_ID,
  activeCustomer,
  subjectFor,
} from "@vuarau/test-fixtures";
import type { Clock } from "../infrastructure/clock.ts";
import type { AuthenticatedPrincipal } from "../infrastructure/auth/principal.ts";
import type { CommandContext, CommandDeps } from "../modules/shared/command-pipeline.ts";
import {
  InMemoryDatabase,
  sequentialIdGenerator,
} from "../infrastructure/persistence/in-memory/in-memory-unit-of-work.ts";

/**
 * Wiring for the application and contract test projects: real handlers, real
 * pipeline, real authorization, real in-memory repositories. Nothing is stubbed.
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

/** Every identity the authorization tests need, seeded once. */
const SEEDED_MEMBERS: ReadonlyArray<{ actorId: ActorId; role: WorkspaceRole; isActive: boolean }> =
  [
    { actorId: ACTOR_ID, role: "owner", isActive: true },
    { actorId: ACCOUNTANT_ACTOR_ID, role: "accountant", isActive: true },
    { actorId: SALES_ACTOR_ID, role: "sales", isActive: true },
    { actorId: WAREHOUSE_ACTOR_ID, role: "warehouse", isActive: true },
    { actorId: DELIVERY_ACTOR_ID, role: "delivery", isActive: true },
    // An owner whose access was turned off — distinct from never having had any.
    { actorId: REVOKED_ACTOR_ID, role: "owner", isActive: false },
  ];

export type Harness = {
  readonly db: InMemoryDatabase;
  readonly deps: CommandDeps;
  readonly clock: MutableClock;
  /** The default context: the `owner` actor, matching pre-Milestone-1 behaviour. */
  readonly ctx: CommandContext;
  /** A context for any seeded actor, so a test can pick the identity it means. */
  contextFor(actorId: ActorId): CommandContext;
};

export function createHarness(): Harness {
  const db = new InMemoryDatabase(sequentialIdGenerator());

  db.registerWorkspace(WORKSPACE_ID, WORKSPACE_NAME);
  db.registerWorkspace(OTHER_WORKSPACE_ID, OTHER_WORKSPACE_NAME);

  for (const member of SEEDED_MEMBERS) {
    db.grantMembership(WORKSPACE_ID, member.actorId, member.role, member.isActive);
    db.registerActor(subjectFor(member.actorId), member.actorId);
  }

  // A member of a different workspace entirely: knowing an id is not access.
  db.grantMembership(OTHER_WORKSPACE_ID, FOREIGN_ACTOR_ID, "owner", true);
  db.registerActor(subjectFor(FOREIGN_ACTOR_ID), FOREIGN_ACTOR_ID);

  db.seedCustomer(activeCustomer);
  for (const [id, displayName, preferredUnit] of [
    [PRODUCT_CA_CHUA_ID, "Cà chua", "kg"],
    [PRODUCT_RAU_MUONG_ID, "Rau muống", "bo"],
    [PRODUCT_OT_ID, "Ớt hiểm", "thung"],
  ] as const) {
    db.seedProduct({
      id,
      workspaceId: WORKSPACE_ID,
      displayName,
      aliases: [],
      preferredUnit,
      isActive: true,
      version: 1,
      createdAt: LATEST_RECORDED_AT,
      updatedAt: LATEST_RECORDED_AT,
    });
  }

  const clock = mutableClock();
  const deps: CommandDeps = { uow: db.unitOfWork(), clock };

  const contextFor = (actorId: ActorId): CommandContext => ({
    deps,
    principal: principalFor(actorId),
  });

  return { db, deps, clock, ctx: contextFor(ACTOR_ID), contextFor };
}

/**
 * Builds a principal the way a verified token would have. Tests that exercise
 * token verification itself use the real verifier instead — see
 * `jwt-verifier.app.test.ts`.
 */
export function principalFor(actorId: ActorId): AuthenticatedPrincipal {
  return { actorId, subject: subjectFor(actorId) };
}

/** Sums a customer's account entries — the only definition of a balance there is. */
export function ledgerBalance(harness: Harness, customerId: string): number {
  return harness.db
    .entriesFor(WORKSPACE_ID, customerId)
    .reduce((total, entry) => total + entry.amount.amountMinor, 0);
}
