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
];

function run(): void {
  const databaseUrl = process.env["DATABASE_URL"]?.trim();
  if (databaseUrl === undefined || databaseUrl.length === 0) {
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

if (import.meta.url === `file://${process.argv[1]}`) run();
