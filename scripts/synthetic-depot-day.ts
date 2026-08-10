import { spawnSync } from "node:child_process";

type EvidenceStep = {
  readonly name: string;
  readonly testFile: string;
  readonly proves: readonly string[];
  readonly truthDimensions: readonly string[];
};

/**
 * Runs the existing real-PostgreSQL depot-day and restore journeys as one
 * release evidence command. The tests own fixture creation and cleanup; this
 * wrapper owns the exact-SHA/clean-tree boundary and emits a small JSON packet.
 */
export const SYNTHETIC_DEPOT_DAY_STEPS: readonly EvidenceStep[] = [
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
    name: "cash → statement matching → close-side cash evidence",
    testFile: "apps/api/src/infrastructure/persistence/drizzle/cashbook.db.test.ts",
    proves: [
      "customer payment reaches the selected cash account once",
      "cash reconciliation remains exact",
      "statement matching is non-financial and idempotent",
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

  const databaseUrl = createSyntheticDatabaseUrl(sourceUrl, sha.stdout.trim());
  if (databaseUrl === null) return;

  const startedAt = new Date().toISOString();
  const command = [
    "exec",
    "vitest",
    "run",
    "--project",
    "db",
    ...SYNTHETIC_DEPOT_DAY_STEPS.map((step) => step.testFile),
  ];
  const result = spawnSync("pnpm", command, {
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });
  if (result.stdout.length > 0) process.stderr.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);

  const evidence = SYNTHETIC_DEPOT_DAY_STEPS.map((step) => ({
    ...step,
    status: result.status === 0 ? ("pass" as const) : ("fail" as const),
  }));
  const report = {
    kind: "SYNTHETIC_DEPOT_DAY",
    releaseSha: sha.stdout.trim(),
    database: "disposable-postgresql",
    startedAt,
    completedAt: new Date().toISOString(),
    evidence,
    status: result.status === 0 ? "PASS" : "FAIL",
    fieldValidation: "NOT_RUN_BY_AUTOMATION",
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = result.status === 0 ? 0 : 1;
}

function createSyntheticDatabaseUrl(sourceUrl: string, releaseSha: string): string | null {
  let source: URL;
  try {
    source = new URL(sourceUrl);
  } catch {
    console.error("synthetic:depot-day requires a valid PostgreSQL DATABASE_URL.");
    process.exitCode = 2;
    return null;
  }

  if (!["localhost", "127.0.0.1", "::1"].includes(source.hostname)) {
    console.error("synthetic:depot-day requires a local PostgreSQL host.");
    process.exitCode = 2;
    return null;
  }

  const requestedName = source.pathname.replace(/^\//, "");
  const databaseName =
    process.env["SYNTHETIC_DATABASE_URL"] === undefined
      ? `vuarau_synthetic_${releaseSha.slice(0, 12)}_test`
      : requestedName;
  if (!databaseName.endsWith("_test") || !/^[a-z0-9_]+$/.test(databaseName)) {
    console.error("synthetic:depot-day requires a database name ending in _test.");
    process.exitCode = 2;
    return null;
  }

  const admin = new URL(source.toString());
  admin.pathname = "/postgres";
  const exists = spawnSync(
    "psql",
    [admin.toString(), "-Atqc", `select 1 from pg_database where datname = '${databaseName}'`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  if (exists.status !== 0) {
    console.error("synthetic:depot-day could not connect to the local PostgreSQL admin database.");
    process.exitCode = 2;
    return null;
  }
  if (exists.stdout.trim() !== "1") {
    const created = spawnSync(
      "psql",
      [admin.toString(), "-v", "ON_ERROR_STOP=1", "-c", `CREATE DATABASE "${databaseName}"`],
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    if (created.status !== 0) {
      console.error("synthetic:depot-day could not create its disposable database.");
      process.exitCode = 2;
      return null;
    }
  }

  const target = new URL(source.toString());
  target.pathname = `/${databaseName}`;
  return target.toString();
}

if (import.meta.url === `file://${process.argv[1]}`) run();
