import { and, asc, eq } from "drizzle-orm";
import type {
  ActorId,
  CustomerId,
  DebtLedgerEntryDto,
  ProductId,
  WorkspaceId,
  WorkspaceRole,
} from "@vuarau/domain-contracts";
import { createDatabase, type Database } from "../client.ts";
import { runMigrations } from "../migrate.ts";
import { toLedgerEntryDto } from "../repositories/row-mappers.ts";
import {
  actors,
  auditLogs,
  customers,
  debtLedgerEntries,
  products,
  workspaces,
  workspaceMemberships,
} from "../schema/index.ts";

/**
 * Shared setup for tests that need a real Postgres.
 *
 * Without `DATABASE_URL` the suites **skip** rather than fail, so a laptop with no
 * database still gets a green `pnpm verify`. CI provides one, so they run there.
 * See docs/08-qa/test-strategy.md.
 */
export const DATABASE_URL = process.env["DATABASE_URL"];
export const hasDatabase = DATABASE_URL !== undefined && DATABASE_URL.length > 0;

export type DbTestContext = {
  readonly database: Database;
  readonly workspaceId: WorkspaceId;
  readonly actorId: ActorId;
  readonly customerId: CustomerId;
  /** Cà chua, rau muống, ớt — the three products CASE-SALE-001 sells. */
  readonly productIds: readonly [ProductId, ProductId, ProductId];
  /** The verified JWT subject that resolves to `actorId` (BR-AUTH-005). */
  readonly subject: string;
  /**
   * One actor per role, plus a revoked one and a foreigner, so the authorization
   * suite can exercise every branch against real rows.
   */
  readonly roleActors: Readonly<Record<WorkspaceRole, ActorId>>;
  readonly revokedActorId: ActorId;
  readonly foreignWorkspaceId: WorkspaceId;
  readonly foreignActorId: ActorId;
  subjectOf(actorId: ActorId): string;
  /**
   * The seeded customer's ledger, in business-time order.
   *
   * Provided here so that `apps/api` integration tests can assert on stored rows
   * without importing `drizzle-orm` — the API layer talks to persistence through
   * ports, and a test that reached for the query builder would be the first
   * crack in that (docs/10-ai-coding/REPO_MAP.md).
   */
  ledgerRows(): Promise<readonly DebtLedgerEntryDto[]>;
  auditActions(): Promise<readonly string[]>;
  close(): Promise<void>;
};

/**
 * Every run gets a fresh workspace, so suites never see each other's rows and can
 * run in parallel — and re-running the suite does not accumulate state. It also
 * means each database test is incidentally a workspace-isolation test.
 *
 * This is the one place random ids are used. Assertions are on balances and
 * counts within the workspace, which stay deterministic; the alternative would be
 * deleting rows between runs, and the ledger refuses deletes by design.
 */
export async function createDbTestContext(seedName: string): Promise<DbTestContext> {
  if (!hasDatabase) {
    throw new Error("createDbTestContext called without DATABASE_URL.");
  }

  await runMigrations(DATABASE_URL!);
  const database = createDatabase(DATABASE_URL!, { max: 4 });

  const workspaceId = crypto.randomUUID() as WorkspaceId;
  const foreignWorkspaceId = crypto.randomUUID() as WorkspaceId;
  const customerId = crypto.randomUUID() as CustomerId;
  const now = new Date();

  const subjectOf = (id: ActorId): string => `sub-${id}`;

  const roleActors: Record<WorkspaceRole, ActorId> = {
    owner: crypto.randomUUID() as ActorId,
    accountant: crypto.randomUUID() as ActorId,
    sales: crypto.randomUUID() as ActorId,
    warehouse: crypto.randomUUID() as ActorId,
    delivery: crypto.randomUUID() as ActorId,
  };
  const actorId = roleActors.owner;
  const revokedActorId = crypto.randomUUID() as ActorId;
  const foreignActorId = crypto.randomUUID() as ActorId;

  await database.db.insert(workspaces).values([
    { id: workspaceId, name: `test:${seedName}` },
    { id: foreignWorkspaceId, name: `test:${seedName}:foreign` },
  ]);

  const allActors: Array<{ id: ActorId; label: string }> = [
    ...Object.entries(roleActors).map(([role, id]) => ({ id, label: `${seedName}:${role}` })),
    { id: revokedActorId, label: `${seedName}:revoked` },
    { id: foreignActorId, label: `${seedName}:foreign` },
  ];

  await database.db.insert(actors).values(
    allActors.map((actor) => ({
      id: actor.id,
      supabaseUserId: subjectOf(actor.id),
      displayName: `tester:${actor.label}`,
    })),
  );

  await database.db.insert(workspaceMemberships).values([
    ...Object.entries(roleActors).map(([role, id]) => ({
      workspaceId,
      actorId: id,
      role: role as WorkspaceRole,
    })),
    // Was a member, access revoked — a different answer from never having had any.
    { workspaceId, actorId: revokedActorId, role: "owner" as const, isActive: false },
    // Full rights, but in a different depot entirely.
    { workspaceId: foreignWorkspaceId, actorId: foreignActorId, role: "owner" as const },
  ]);
  await database.db.insert(customers).values({
    id: customerId,
    workspaceId,
    displayName: "Chị Lan chợ Bình Điền",
    phone: "0901234567",
    note: null,
    isActive: true,
    version: 1,
    transactionTime: now,
    recordedAt: now,
    updatedAt: now,
  });

  const productIds = [
    crypto.randomUUID() as ProductId,
    crypto.randomUUID() as ProductId,
    crypto.randomUUID() as ProductId,
  ] as const;
  const productNames = ["Cà chua", "Rau muống", "Ớt hiểm"];

  await database.db.insert(products).values(
    productIds.map((id, index) => ({
      id,
      workspaceId,
      name: productNames[index]!,
      defaultUnitPriceMinor: null,
      currency: "VND" as const,
      isActive: true,
    })),
  );

  return {
    database,
    workspaceId,
    actorId,
    customerId,
    productIds,
    subject: subjectOf(actorId),
    roleActors,
    revokedActorId,
    foreignWorkspaceId,
    foreignActorId,
    subjectOf,

    async ledgerRows() {
      const rows = await database.db
        .select()
        .from(debtLedgerEntries)
        .where(
          and(
            eq(debtLedgerEntries.workspaceId, workspaceId),
            eq(debtLedgerEntries.customerId, customerId),
          ),
        )
        .orderBy(asc(debtLedgerEntries.transactionTime), asc(debtLedgerEntries.recordedAt));
      return rows.map(toLedgerEntryDto);
    },

    async auditActions() {
      const rows = await database.db
        .select({ action: auditLogs.action })
        .from(auditLogs)
        .where(eq(auditLogs.workspaceId, workspaceId))
        .orderBy(asc(auditLogs.recordedAt));
      return rows.map((row) => row.action);
    },

    close: () => database.sql.end(),
  };
}
