import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { and, eq } from "drizzle-orm";
import type { ActorId, WorkspaceId, WorkspaceRole } from "@vuarau/domain-contracts";
import type { Database } from "./client.ts";
import {
  actors,
  customers,
  products,
  qualityGrades,
  workspaces,
  workspaceMemberships,
} from "./schema/index.ts";

/**
 * Read-only queries for `ops:pilot-readiness`, which asks questions no procedure
 * asks: how many members has this depot, is the schema current, is there demo
 * data in here.
 *
 * They live in `packages/db` because `apps/api` may not import a query builder
 * (boundary-check), and they are **not ports**: a port exists for what the
 * application layer needs at request time, and none of this happens at request
 * time. Everything here reads; nothing writes.
 */

const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

export type MigrationState = {
  /** How many migration files this checkout has. */
  readonly expected: number;
  /** How many of them the database has recorded. */
  readonly applied: number;
  /** Migrations this checkout carries that the database has not run. */
  readonly missing: readonly string[];
  /**
   * How many migrations the database has that this checkout does not know about
   * — a database migrated by different code from the one about to serve it.
   */
  readonly unknown: number;
};

/**
 * Whether the database's schema is exactly the one this checkout expects.
 *
 * **By hash, not by count.** Counting was the first attempt and it was wrong in
 * both directions: a database carrying one stale row from a migration that was
 * later renamed reads as "ahead", and a checkout that dropped a migration reads as
 * "behind". Drizzle records the sha256 of each migration file, which answers the
 * question exactly — is *this* migration in there.
 *
 * Two different failures come out of it, and an operator needs to tell them apart:
 *
 *   missing   the code is ahead of the database. Run `pnpm db:migrate`
 *   unknown   the database is ahead of the code. Somebody deployed a rollback,
 *             or this database belongs to a different deployment
 *
 * When Drizzle's bookkeeping table does not exist, nothing has ever been
 * migrated — reported as such rather than as a crash, because "no migrations have
 * run" is exactly what the operator needs to be told.
 */
export async function migrationState(database: Database): Promise<MigrationState> {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"),
  ) as { entries?: { tag: string }[] };
  const entries = journal.entries ?? [];

  const expectedByHash = new Map<string, string>();
  for (const entry of entries) {
    const sql = readFileSync(join(MIGRATIONS_FOLDER, `${entry.tag}.sql`), "utf8");
    expectedByHash.set(createHash("sha256").update(sql).digest("hex"), entry.tag);
  }

  const tableRows = await database.sql<{ count: string }[]>`
    select count(*)::text as count
    from information_schema.tables
    where table_schema = 'drizzle' and table_name = '__drizzle_migrations'
  `;
  if ((tableRows[0]?.count ?? "0") === "0") {
    return {
      expected: entries.length,
      applied: 0,
      missing: entries.map((entry) => entry.tag),
      unknown: 0,
    };
  }

  const rows = await database.sql<{ hash: string }[]>`
    select hash from drizzle.__drizzle_migrations
  `;
  const appliedHashes = new Set(rows.map((row) => row.hash));

  const missing = [...expectedByHash.entries()]
    .filter(([hash]) => !appliedHashes.has(hash))
    .map(([, tag]) => tag);

  return {
    expected: entries.length,
    applied: entries.length - missing.length,
    missing,
    unknown: [...appliedHashes].filter((hash) => !expectedByHash.has(hash)).length,
  };
}

export async function findWorkspace(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<{ readonly workspaceId: WorkspaceId; readonly name: string } | null> {
  const rows = await database.db
    .select({ id: workspaces.id, name: workspaces.name })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const row = rows[0];
  return row === undefined ? null : { workspaceId: row.id as WorkspaceId, name: row.name };
}

export type WorkspaceMember = {
  readonly actorId: ActorId;
  readonly displayName: string;
  readonly role: WorkspaceRole;
  readonly isActive: boolean;
};

/** Every member of one depot, active or not — the revoked ones matter to a review. */
export async function listMembers(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<readonly WorkspaceMember[]> {
  const rows = await database.db
    .select({
      actorId: workspaceMemberships.actorId,
      displayName: actors.displayName,
      role: workspaceMemberships.role,
      isActive: workspaceMemberships.isActive,
    })
    .from(workspaceMemberships)
    .innerJoin(actors, eq(actors.id, workspaceMemberships.actorId))
    .where(eq(workspaceMemberships.workspaceId, workspaceId));

  return rows.map((row) => ({
    actorId: row.actorId as ActorId,
    displayName: row.displayName,
    role: row.role,
    isActive: row.isActive,
  }));
}

export type CustomerCensus = {
  readonly active: number;
  /** Names that look like seed or test data. Empty is the only passing answer. */
  readonly suspicious: readonly string[];
};

export type ProductCensus = {
  readonly active: number;
  readonly suspicious: readonly string[];
};

export type QualityGradeCensus = {
  readonly active: number;
  readonly suspicious: readonly string[];
};

/**
 * The seed's three customers, and the prefix every end-to-end spec uses.
 *
 * A worker who opens their own depot and sees "Chị Lan chợ Bình Điền" — a name
 * they have never traded with — has been handed a reason to distrust every other
 * name on the screen, and the session is over before it starts. Matched exactly
 * rather than fuzzily: a real customer could genuinely be called Chị Lan.
 */
const SEED_CUSTOMER_NAMES = ["Chị Lan chợ Bình Điền", "Cô Bảy vựa Hóc Môn", "Anh Tuấn mới mở"];
const FIXTURE_PREFIXES = ["E2E ", "test:", "Test ", "Fixture"];

export async function customerCensus(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<CustomerCensus> {
  const rows = await database.db
    .select({ displayName: customers.displayName })
    .from(customers)
    .where(and(eq(customers.workspaceId, workspaceId), eq(customers.isActive, true)));

  const suspicious = rows
    .map((row) => row.displayName)
    .filter(
      (name) =>
        SEED_CUSTOMER_NAMES.includes(name) ||
        FIXTURE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    );

  return { active: rows.length, suspicious };
}

export async function productCensus(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<ProductCensus> {
  const rows = await database.db
    .select({ displayName: products.name })
    .from(products)
    .where(and(eq(products.workspaceId, workspaceId), eq(products.isActive, true)));
  return {
    active: rows.length,
    suspicious: rows
      .map((row) => row.displayName)
      .filter((name) => FIXTURE_PREFIXES.some((prefix) => name.startsWith(prefix))),
  };
}

export async function qualityGradeCensus(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<QualityGradeCensus> {
  const rows = await database.db
    .select({ displayName: qualityGrades.name })
    .from(qualityGrades)
    .where(and(eq(qualityGrades.workspaceId, workspaceId), eq(qualityGrades.isActive, true)));
  return {
    active: rows.length,
    suspicious: rows
      .map((row) => row.displayName)
      .filter((name) => FIXTURE_PREFIXES.some((prefix) => name.startsWith(prefix))),
  };
}

/** Names only, for a dry-run duplicate-candidate warning before import. */
export async function existingCustomerNames(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<readonly string[]> {
  return (
    await database.db
      .select({ displayName: customers.displayName })
      .from(customers)
      .where(and(eq(customers.workspaceId, workspaceId), eq(customers.isActive, true)))
  ).map((row) => row.displayName);
}

/** Product counterpart of `existingCustomerNames`; still scoped to one workspace. */
export async function existingProductNames(
  database: Database,
  workspaceId: WorkspaceId,
): Promise<readonly string[]> {
  return (
    await database.db
      .select({ displayName: products.name })
      .from(products)
      .where(and(eq(products.workspaceId, workspaceId), eq(products.isActive, true)))
  ).map((row) => row.displayName);
}

/** Whether the connection answers at all. Nothing about what is in it. */
export async function databaseReachable(database: Database): Promise<boolean> {
  try {
    await database.sql`select 1`;
    return true;
  } catch {
    return false;
  }
}
