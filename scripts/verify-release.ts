import { spawnSync } from "node:child_process";

type ReleaseStep = {
  readonly name: string;
  readonly args: readonly string[];
  readonly env?: "release-performance";
};

/**
 * Keep the release gate in one executable list. CI may expose the same checks
 * as separate named steps, but it must not silently omit one of these commands.
 */
export const RELEASE_STEPS: readonly ReleaseStep[] = [
  { name: "static checks", args: ["check:static"] },
  { name: "apply migrations", args: ["db:migrate"] },
  { name: "schema/migration drift", args: ["db:generate:check"] },
  {
    name: "production-scale performance",
    args: ["perf:production-scale"],
    env: "release-performance",
  },
  { name: "migration rehearsal", args: ["rehearse:migrations"] },
  { name: "all Vitest projects", args: ["test"] },
  { name: "Next production build", args: ["web:build"] },
  { name: "Storybook build", args: ["web:storybook"] },
  { name: "production E2E build", args: ["web:e2e:build"] },
  { name: "production E2E", args: ["web:e2e"] },
];

export function requireReleaseEnvironment(environment: {
  readonly databaseUrl?: string;
  readonly releasePerformanceDatabaseUrl?: string;
}): void {
  if (!environment.databaseUrl) {
    throw new Error("DATABASE_URL is required for verify:release.");
  }
  if (!environment.releasePerformanceDatabaseUrl) {
    throw new Error(
      "RELEASE_PERF_DATABASE_URL is required; performance rehearsal must use a disposable database.",
    );
  }
  if (environment.releasePerformanceDatabaseUrl === environment.databaseUrl) {
    throw new Error(
      "RELEASE_PERF_DATABASE_URL must differ from DATABASE_URL so performance data cannot pollute the test database.",
    );
  }
}

function run(step: ReleaseStep, environment: NodeJS.ProcessEnv): void {
  console.log(`\n=== verify:release — ${step.name} ===`);
  const result = spawnSync("pnpm", step.args, {
    stdio: "inherit",
    env:
      step.env === "release-performance"
        ? { ...environment, DATABASE_URL: environment["RELEASE_PERF_DATABASE_URL"] }
        : environment,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `verify:release failed at ${step.name} with exit ${result.status ?? "unknown"}.`,
    );
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  requireReleaseEnvironment({
    ...(process.env["DATABASE_URL"] ? { databaseUrl: process.env["DATABASE_URL"] } : {}),
    ...(process.env["RELEASE_PERF_DATABASE_URL"]
      ? { releasePerformanceDatabaseUrl: process.env["RELEASE_PERF_DATABASE_URL"] }
      : {}),
  });
  for (const step of RELEASE_STEPS) run(step, process.env);
  console.log("\n✓ verify:release: all release checks passed.");
}
