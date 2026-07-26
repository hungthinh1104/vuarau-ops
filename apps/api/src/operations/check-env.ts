import { describeConfig, readServerConfig } from "../infrastructure/config.ts";

/**
 * Checks a deployment's configuration without printing any of it.
 *
 * Run it before starting the API, and again after any environment change:
 *
 *   pnpm --filter @vuarau/api ops:check-env
 *
 * The whole value is in what it does **not** do. It reads variables, judges them
 * and reports variable names and derived facts — never a value. A checker that
 * echoed what it found would put a database password and a signing secret into
 * whatever captured its output, which for a deploy pipeline is a build log with
 * its own retention and its own access list.
 *
 * Exit codes are the interface: 0 means the API would start, 1 means it would
 * not, and the reasons are on stderr with one variable per line.
 */
const result = readServerConfig(process.env);

if (!result.ok) {
  console.error("✗ configuration incomplete — the API would refuse to start:\n");
  for (const problem of result.problems) {
    console.error(`  ${problem.variable}: ${problem.problem}`);
  }
  console.error("\nSee .env.example and docs/11-operations/deployment-contract.md.");
  process.exit(1);
}

console.warn("✓ configuration accepted — the API would start.\n");
for (const line of describeConfig(result.config)) console.warn(`  ${line}`);

if (result.config.appEnv !== "pilot") {
  console.warn(
    "\nnote: APP_ENV is not `pilot`, so the stricter checks are off — HS256 is " +
      "permitted, and neither the issuer nor the public origin has to be https. " +
      "Set APP_ENV=pilot for a real depot.",
  );
}
