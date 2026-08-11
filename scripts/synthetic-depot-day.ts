import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

type EvidenceStep = {
  readonly name: string;
  readonly testFile: string;
  readonly proves: readonly string[];
  readonly truthDimensions: readonly string[];
};

type SyntheticDatabaseTarget = {
  readonly databaseUrl: string;
  readonly adminUrl: string;
  readonly databaseName: string;
};

export type SyntheticDatabaseSourceValidation =
  | { readonly ok: true; readonly source: URL; readonly databaseName: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Runs the canonical one-workspace PostgreSQL rehearsal together with the
 * focused recovery/read-model suites. The tests own fixture creation and
 * cleanup; this wrapper owns the exact-SHA/clean-tree boundary and emits a
 * small JSON packet.
 */
export const SYNTHETIC_DEPOT_DAY_STEPS: readonly EvidenceStep[] = [
  {
    name: "one workspace: purchase → receiving → sale → dispatch/return → payments → restore",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/synthetic-depot-day.db.test.ts",
    proves: [
      "one PostgreSQL workspace keeps receiving and fulfilment partials tied to canonical lines",
      "duplicate confirmation and dispatch replay the original result without a second effect",
      "customer payment reversal, supplier payment, coverage, reports and reconciliation remain attributable",
      "the exported day restores into an empty target arrangement and reconciles again",
    ],
    truthDimensions: [
      "money",
      "goods",
      "commercial",
      "correction",
      "partial",
      "retry",
      "explanation",
    ],
  },
  {
    name: "sale → payment → reversal → account rebuild",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/full-slice.db.test.ts",
    proves: [
      "sale posting and exact customer ledger effect",
      "customer payment and compensating reversal",
      "workspace isolation, authorization and projection rebuild",
    ],
    truthDimensions: ["money", "commercial", "correction", "retry", "explanation"],
  },
  {
    name: "purchase → receiving → inventory → sale → dispatch → return → reports",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/depot-operations.db.test.ts",
    proves: [
      "supplier and purchase confirmation",
      "receipt and inventory movements",
      "sale posting and partial dispatch/return",
      "retry, documents, reports and backup export",
    ],
    truthDimensions: ["money", "goods", "commercial", "partial", "retry", "explanation"],
  },
  {
    name: "backup → restore → rebuild → reconciliation",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/operations-restore.db.test.ts",
    proves: [
      "backup restore validation",
      "customer, supplier and inventory reconciliation",
      "projection rebuild without changing canonical facts",
    ],
    truthDimensions: ["money", "goods", "correction", "retry", "explanation"],
  },
  {
    name: "supplier → payable → supplier payment and cashbook",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/supplier-account.db.test.ts",
    proves: [
      "supplier payable ledger and exact payment effect",
      "supplier payment reversal and projection parity",
      "supplier workspace isolation and deterministic pagination",
    ],
    truthDimensions: ["money", "commercial", "correction", "retry", "explanation"],
  },
  {
    name: "cash → statement matching → operational close",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/cashbook.db.test.ts",
    proves: [
      "customer payment reaches the selected cash account once",
      "cash reconciliation remains exact",
      "statement matching is non-financial and idempotent",
      "operational close signs off persisted cash and inventory observations and replays exactly",
    ],
    truthDimensions: ["money", "retry", "explanation"],
  },
];

function run(): void {
  const sourceUrl =
    process.env["SYNTHETIC_DATABASE_URL"]?.trim() ?? process.env["DATABASE_URL"]?.trim();
  if (sourceUrl === undefined || sourceUrl.length === 0) {
    console.error("synthetic:depot-day requires DATABASE_URL for disposable PostgreSQL.");
    process.exitCode = 2;
    return;
  }

  const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });
  const tree = spawnSync("git", ["status", "--porcelain"], { encoding: "utf8" });
  if (sha.status !== 0 || tree.status !== 0 || tree.stdout.trim().length > 0) {
    console.error("synthetic:depot-day requires a clean committed tree.");
    process.exitCode = 2;
    return;
  }

  const target = createSyntheticDatabase(sourceUrl, sha.stdout.trim());
  if (target === null) return;

  const startedAt = new Date().toISOString();
  const command = [
    "exec",
    "vitest",
    "run",
    "--project",
    "db",
    ...SYNTHETIC_DEPOT_DAY_STEPS.map((step) => step.testFile),
  ];
  let resultStatus = 1;
  let cleanupStatus = 1;
  try {
    const result = spawnSync("pnpm", command, {
      encoding: "utf8",
      env: { ...process.env, DATABASE_URL: target.databaseUrl },
    });
    resultStatus = result.status ?? 1;
    if (result.stdout.length > 0) process.stderr.write(result.stdout);
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
  } finally {
    const cleanup = spawnSync(
      "psql",
      [
        target.adminUrl,
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        `DROP DATABASE IF EXISTS "${target.databaseName}" WITH (FORCE)`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    cleanupStatus = cleanup.status ?? 1;
    if (cleanupStatus !== 0 && cleanup.stderr.length > 0) process.stderr.write(cleanup.stderr);
  }

  const evidence = SYNTHETIC_DEPOT_DAY_STEPS.map((step) => ({
    ...step,
    status: resultStatus === 0 && cleanupStatus === 0 ? ("pass" as const) : ("fail" as const),
  }));
  const report = {
    kind: "SYNTHETIC_DEPOT_DAY",
    releaseSha: sha.stdout.trim(),
    database: "disposable-postgresql",
    cleanup: cleanupStatus === 0 ? "PASS" : "FAIL",
    startedAt,
    completedAt: new Date().toISOString(),
    evidence,
    status: resultStatus === 0 && cleanupStatus === 0 ? "PASS" : "FAIL",
    fieldValidation: "NOT_RUN_BY_AUTOMATION",
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = resultStatus === 0 && cleanupStatus === 0 ? 0 : 1;
}

export function validateSyntheticDatabaseSource(
  sourceUrl: string,
): SyntheticDatabaseSourceValidation {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    return { ok: false, reason: "requires a valid PostgreSQL DATABASE_URL" };
  }

  if (!(source.protocol === "postgres:" || source.protocol === "postgresql:")) {
    return { ok: false, reason: "requires a PostgreSQL DATABASE_URL" };
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) {
    return { ok: false, reason: "requires a local PostgreSQL host" };
  }

  const databaseName = source.pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test") || !/^[a-z0-9_]+$/.test(databaseName)) {
    return { ok: false, reason: "requires a disposable database name ending in _test" };
  }

  return { ok: true, source, databaseName };
}

export function buildSyntheticDatabaseName(
  releaseSha: string,
  nonce = randomBytes(4).toString("hex"),
): string {
  return `vuarau_synthetic_${releaseSha.slice(0, 12)}_${nonce}_test`;
}

function createSyntheticDatabase(
  sourceUrl: string,
  releaseSha: string,
): SyntheticDatabaseTarget | null {
  const validation = validateSyntheticDatabaseSource(sourceUrl);
  if (!validation.ok) {
    console.error(`synthetic:depot-day ${validation.reason}.`);
    process.exitCode = 2;
    return null;
  }

  const admin = new URL(validation.source.toString());
  admin.pathname = "/postgres";
  const databaseName = buildSyntheticDatabaseName(releaseSha);
  const created = spawnSync(
    "psql",
    [admin.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${databaseName}"`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (created.status !== 0) {
    if (created.stderr.length > 0) process.stderr.write(created.stderr);
    console.error("synthetic:depot-day could not create its disposable database.");
    process.exitCode = 2;
    return null;
  }

  const target = new URL(validation.source.toString());
  target.pathname = `/${databaseName}`;
  return { databaseUrl: target.toString(), adminUrl: admin.toString(), databaseName };
}

if (import.meta.url === `file://${process.argv[1]}`) run();
