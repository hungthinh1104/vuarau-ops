import { execFileSync } from "node:child_process";

/** Return migration paths changed by schema generation. */
export function migrationDrift(status: string): string[] {
  return status
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  execFileSync("pnpm", ["db:generate"], { stdio: "inherit" });
  const status = execFileSync("git", ["status", "--porcelain", "--", "packages/db/migrations"], {
    encoding: "utf8",
  });
  const drift = migrationDrift(status);
  if (drift.length > 0) {
    console.error("✗ db:generate:check: schema and migrations are out of sync.");
    console.error("Run 'pnpm db:generate' and commit the generated migration files:");
    for (const path of drift) console.error(`  ${path}`);
    process.exit(1);
  }
  console.log("✓ db:generate:check: schema and migrations are in sync.");
}
